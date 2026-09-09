import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
if(import.meta.env.PROD&&'serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(error=>{console.error('Não foi possível preparar os recursos offline.',error);});});}

window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();(window as Window & {nexusInstallPrompt?:Event}).nexusInstallPrompt=event;});
