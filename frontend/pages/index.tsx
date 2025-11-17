import Head from 'next/head';
import { OnlineCounter } from '../components/OnlineCounter';
import { VideoChat } from '../components/VideoChat';
import { AdBanner } from '../components/AdBanner';

export default function Home() {
  return (
    <>
      <Head>
        <title>Roulette Video Chat</title>
        <meta name="description" content="Анонимный видеочат-рулетка с VIP-функциями и современной админкой." />
      </Head>
      <div className="relative">
        <div className="absolute top-4 right-4">
          <OnlineCounter />
        </div>
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <VideoChat />
            </div>
            <div className="hidden md:block">
              <AdBanner slot="main" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


