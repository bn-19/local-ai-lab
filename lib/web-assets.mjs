import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const mimeTypes={
  '.html':'text/html',
  '.js':'text/javascript',
  '.css':'text/css',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.ico':'image/x-icon',
  '.woff2':'font/woff2',
};

// Inventory only files from the packaged web build. Converting the URL with
// fileURLToPath is required because Application Support paths can contain spaces.
export async function addWebAssets(publicFiles,serverModuleURL,prefix='/app/') {
  const root=fileURLToPath(new URL('./web/dist/',serverModuleURL));
  async function add(dir,urlPrefix) {
    try {
      for(const entry of await readdir(dir,{withFileTypes:true})) {
        if(entry.isSymbolicLink())continue;
        const file=path.join(dir,entry.name),url=urlPrefix+entry.name;
        if(entry.isDirectory())await add(file,url+'/');
        else {
          const mime=mimeTypes[path.extname(entry.name)];
          if(!mime)continue;
          publicFiles.set(url,[file,mime]);
          if(entry.name==='index.html')publicFiles.set(urlPrefix,[file,mime]);
        }
      }
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
    }
  }
  await add(root,prefix);
}
