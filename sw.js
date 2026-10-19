// sw.js — 后台上传 Service Worker
// 页面关闭后，浏览器通过 Background Sync 唤醒本脚本，把 IndexedDB 队列里的照片继续传完
var OWNER='qqq416423-a11y';
var REPO='cam-photos';
var BRANCH='main';

self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});

function idb(){
  return new Promise(function(res,rej){
    var r=indexedDB.open('camq',1);
    r.onupgradeneeded=function(){
      var db=r.result;
      if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'name'});
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');
    };
    r.onsuccess=function(){res(r.result)};
    r.onerror=function(){rej(r.error)};
  });
}
function qAll(db){
  return new Promise(function(res){
    var r=db.transaction('queue','readonly').objectStore('queue').getAll();
    r.onsuccess=function(){res(r.result||[])};
    r.onerror=function(){res([])};
  });
}
function qDel(db,name){
  return new Promise(function(res){
    var r=db.transaction('queue','readwrite').objectStore('queue').delete(name);
    r.onsuccess=res;r.onerror=res;
  });
}
function getMeta(db,key){
  return new Promise(function(res){
    var r=db.transaction('meta','readonly').objectStore('meta').get(key);
    r.onsuccess=function(){res(r.result)};
    r.onerror=function(){res(null)};
  });
}
function upload(b64,name,token,uid){
  return fetch('https://api.github.com/repos/'+OWNER+'/'+REPO+'/contents/photos/'+(uid?encodeURIComponent(uid)+'/':'')+name,{
    method:'PUT',
    headers:{Authorization:'token '+token,'Content-Type':'application/json'},
    body:JSON.stringify({message:'auto photo',branch:BRANCH,content:b64})
  });
}

async function flush(){
  try{
    var db=await idb();
    var token=await getMeta(db,'token');
    if(!token)return;
    var uid=(await getMeta(db,'uid'))||'';
    var list=await qAll(db);
    await Promise.all(list.map(function(it,i){
      // 错峰发起，避免同时提交产生冲突
      return new Promise(function(res){setTimeout(res,i*600)}).then(function(){
        return upload(it.b64,it.name,token,uid).then(function(r){
          if(r.ok||r.status===422)return qDel(db,it.name);
        });
      }).catch(function(){});
    }));
  }catch(e){}
}

self.addEventListener('sync',function(e){
  if(e.tag==='cam-upload')e.waitUntil(flush());
});
