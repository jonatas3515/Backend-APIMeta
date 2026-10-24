import Head from 'next/head';
import AdminMasterPanel from '../../components/AdminMasterPanel';

export default function AdminPage() {
  return (
    <>
      <Head>
        <title>Painel Admin — JusJNC SaaS</title>
      </Head>
      <AdminMasterPanel />
    </>
  );
}
