import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Summer’s Learning Lab',description:'Maths and English, at Summer’s pace.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Summer’s Lab',statusBarStyle:'default'},icons:{icon:'/icon.svg',apple:'/app-icon.png'}};
export const viewport={themeColor:'#EEEDFB',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>;}
