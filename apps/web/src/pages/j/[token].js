import JoinGroupPage, { getServerSideProps as joinGroupGetServerSideProps } from '../join-group/[token]';

export default JoinGroupPage;

export async function getServerSideProps(context) {
  return joinGroupGetServerSideProps(context);
}
