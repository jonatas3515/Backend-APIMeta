import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR" className="dark bg-[#181A1B] text-gray-100">
      <Head>
        <link rel="icon" href="/Logo%20transparente.png" type="image/png" />
      </Head>
      <body className="bg-[#181A1B] text-gray-100 antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
