param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('pack', 'unpack')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$BundlePath,

  [Parameter(Mandatory = $true)]
  [string]$Passphrase,

  [string[]]$InputPaths = @(),

  [string]$DestinationPath = '.'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$magicHeader = [System.Text.Encoding]::ASCII.GetBytes('CSB1')
$saltLength = 16
$ivLength = 16
$iterations = 200000

function Resolve-RepoPath {
  param([string]$PathValue)

  $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
  return $resolved.Path
}

function New-AesKeyMaterial {
  param(
    [string]$Secret,
    [byte[]]$Salt
  )

  $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Secret, $Salt, $iterations, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  try {
    return $derive.GetBytes(32)
  } finally {
    $derive.Dispose()
  }
}

function Protect-Bytes {
  param(
    [byte[]]$PlainBytes,
    [string]$Secret
  )

  $salt = New-Object byte[] $saltLength
  $iv = New-Object byte[] $ivLength
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($salt)
    $rng.GetBytes($iv)
  } finally {
    $rng.Dispose()
  }
  $key = New-AesKeyMaterial -Secret $Secret -Salt $salt

  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $key
  $aes.IV = $iv

  try {
    $encryptor = $aes.CreateEncryptor()
    try {
      $cipherBytes = $encryptor.TransformFinalBlock($PlainBytes, 0, $PlainBytes.Length)
    } finally {
      $encryptor.Dispose()
    }
  } finally {
    $aes.Dispose()
  }

  $output = New-Object byte[] ($magicHeader.Length + $salt.Length + $iv.Length + $cipherBytes.Length)
  [Array]::Copy($magicHeader, 0, $output, 0, $magicHeader.Length)
  [Array]::Copy($salt, 0, $output, $magicHeader.Length, $salt.Length)
  [Array]::Copy($iv, 0, $output, $magicHeader.Length + $salt.Length, $iv.Length)
  [Array]::Copy($cipherBytes, 0, $output, $magicHeader.Length + $salt.Length + $iv.Length, $cipherBytes.Length)
  return $output
}

function Unprotect-Bytes {
  param(
    [byte[]]$EncryptedBytes,
    [string]$Secret
  )

  if ($EncryptedBytes.Length -lt ($magicHeader.Length + $saltLength + $ivLength + 1)) {
    throw 'Bundle is too short to be valid.'
  }

  $actualHeader = $EncryptedBytes[0..($magicHeader.Length - 1)]
  if (-not [System.Linq.Enumerable]::SequenceEqual($actualHeader, $magicHeader)) {
    throw 'Bundle header is invalid.'
  }

  $saltStart = $magicHeader.Length
  $ivStart = $saltStart + $saltLength
  $cipherStart = $ivStart + $ivLength

  $salt = New-Object byte[] $saltLength
  $iv = New-Object byte[] $ivLength
  $cipherBytes = New-Object byte[] ($EncryptedBytes.Length - $cipherStart)

  [Array]::Copy($EncryptedBytes, $saltStart, $salt, 0, $saltLength)
  [Array]::Copy($EncryptedBytes, $ivStart, $iv, 0, $ivLength)
  [Array]::Copy($EncryptedBytes, $cipherStart, $cipherBytes, 0, $cipherBytes.Length)

  $key = New-AesKeyMaterial -Secret $Secret -Salt $salt
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $key
  $aes.IV = $iv

  try {
    $decryptor = $aes.CreateDecryptor()
    try {
      return $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)
    } finally {
      $decryptor.Dispose()
    }
  } finally {
    $aes.Dispose()
  }
}

if ($Mode -eq 'pack') {
  if (-not $InputPaths -or $InputPaths.Count -eq 0) {
    throw 'InputPaths is required in pack mode.'
  }

  $repoRoot = Resolve-RepoPath (Join-Path $PSScriptRoot '..')
  $bundleFullPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BundlePath))
  $bundleDirectory = Split-Path -Parent $bundleFullPath
  if (-not (Test-Path -LiteralPath $bundleDirectory)) {
    New-Item -ItemType Directory -Path $bundleDirectory | Out-Null
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'bundle.zip'

  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  try {
    Push-Location $repoRoot
    try {
      Compress-Archive -Path $InputPaths -DestinationPath $zipPath -CompressionLevel Optimal
    } finally {
      Pop-Location
    }

    $zipBytes = [System.IO.File]::ReadAllBytes($zipPath)
    $encryptedBytes = Protect-Bytes -PlainBytes $zipBytes -Secret $Passphrase
    [System.IO.File]::WriteAllBytes($bundleFullPath, $encryptedBytes)
    Write-Output "Created encrypted bundle: $bundleFullPath"
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
  exit 0
}

if ($Mode -eq 'unpack') {
  $bundleFullPath = [System.IO.Path]::GetFullPath($BundlePath)
  if (-not (Test-Path -LiteralPath $bundleFullPath)) {
    throw "Bundle not found: $bundleFullPath"
  }

  $destinationFullPath = [System.IO.Path]::GetFullPath($DestinationPath)
  if (-not (Test-Path -LiteralPath $destinationFullPath)) {
    New-Item -ItemType Directory -Path $destinationFullPath | Out-Null
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $tempRoot 'bundle.zip'
  New-Item -ItemType Directory -Path $tempRoot | Out-Null

  try {
    $encryptedBytes = [System.IO.File]::ReadAllBytes($bundleFullPath)
    $zipBytes = Unprotect-Bytes -EncryptedBytes $encryptedBytes -Secret $Passphrase
    [System.IO.File]::WriteAllBytes($zipPath, $zipBytes)
    Expand-Archive -LiteralPath $zipPath -DestinationPath $destinationFullPath -Force
    Write-Output "Extracted bundle to: $destinationFullPath"
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}