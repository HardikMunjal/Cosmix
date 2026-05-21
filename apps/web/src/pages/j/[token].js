export default function JoinLinkAliasPage() {
  return null;
}

export async function getServerSideProps(context) {
  const token = String(context.params?.token || '').trim();
  return {
    redirect: {
      destination: `/join-group/${encodeURIComponent(token)}`,
      permanent: false,
    },
  };
}
