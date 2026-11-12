import 'server-only';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dataDir=process.env.DATA_DIR||path.join(process.cwd(),'data');
const mediaDir=path.join(dataDir,'media');
mkdirSync(mediaDir,{recursive:true,mode:0o700});

export async function storeCmsImage(dataUrl:string){
 if(!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)||dataUrl.length>4_000_000){
  throw new Error('Выберите JPG, PNG или WebP до ~3 МБ');
 }
 const buffer=Buffer.from(dataUrl.split(',')[1],'base64');
 if(buffer.length>3*1024*1024)throw new Error('Размер изображения больше 3 МБ');
 const image=await sharp(buffer,{limitInputPixels:40_000_000}).rotate().resize({
  width:2400,
  height:2400,
  fit:'inside',
  withoutEnlargement:true,
 }).webp({quality:85}).toBuffer();
 const id=randomUUID().replace(/-/g,'').slice(0,24);
 const filename=id+'.webp';
 const full=path.join(mediaDir,filename);
 writeFileSync(full,image,{mode:0o600});
 return {id,filename,url:'/api/portal/media/'+filename,bytes:image.length};
}

export function readCmsMedia(filename:string){
 if(!/^[a-zA-Z0-9._-]{1,80}$/.test(filename)||filename.includes('..'))return null;
 const full=path.join(mediaDir,filename);
 if(!existsSync(full))return null;
 return readFileSync(full);
}

export const mediaStorageMeta={
 path:mediaDir,
 note:'CMS-фото сайта: $DATA_DIR/media на RU VPS. Публичная выдача — GET /api/portal/media/<file>.',
};
