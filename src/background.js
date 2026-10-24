chrome.action.onClicked.addListener(tab=>{
 let url='';try{const u=new URL(tab.url);if(u.protocol==='https:'||u.protocol==='http:')url=u.href;}catch{}
 chrome.tabs.create({url:chrome.runtime.getURL('reader.html')+(url?'?url='+encodeURIComponent(url):'')});
});
