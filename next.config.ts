import type {NextConfig} from 'next';
const config:NextConfig={
 output:'standalone',
 allowedDevOrigins:['terminal.local','127.0.0.1'],
 serverExternalPackages:['sharp','node:sqlite','jose'],
 reactStrictMode:true,
 // Reduce parallel SQLite opens during `next build` page-data collection.
 experimental:{cpus:1},
 async headers(){
  return [{source:'/(.*)',headers:[
   {key:'X-Content-Type-Options',value:'nosniff'},
   {key:'X-Frame-Options',value:'SAMEORIGIN'},
   {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
   {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  ]}];
 },
};
export default config;
