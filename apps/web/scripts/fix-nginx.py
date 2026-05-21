with open('/opt/cosmix/infra/nginx.ec2.https.conf', 'r') as f:
    content = f.read()

old = "    return 301 https://$host$request_uri;"
new = """    proxy_pass http://web:3005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"""

new_content = content.replace(old, new, 1)
if new_content == content:
    print("ERROR: pattern not found, file unchanged")
else:
    with open('/opt/cosmix/infra/nginx.ec2.https.conf', 'w') as f:
        f.write(new_content)
    print("done - redirect removed")
