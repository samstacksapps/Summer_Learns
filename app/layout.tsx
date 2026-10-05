import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Summer’s Learning Lab',description:'A little learning adventure for Summer',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Summer’s Lab',statusBarStyle:'default'},icons:{icon:'/assets/star.png',apple:'/assets/star.png'}};
export const viewport={themeColor:'#eaf5ff',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>;}
