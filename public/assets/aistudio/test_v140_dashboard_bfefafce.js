const fs=require('fs'); const vm=require('vm');
const path=require('path'); const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const start=html.indexOf('function analyticsNumber(value)');
const end=html.indexOf('async function syncAnalyticsChannel', start);
if(start<0||end<0) throw new Error('analytics functions not found');
const source=html.slice(start,end)+'\nrenderAnalyticsDashboard();';
const elements={};
function $(id){ if(!elements[id]) elements[id]={id,value:id==='analyticsDays'?'30':'',textContent:'',innerHTML:''}; return elements[id]; }
const ctx={
  $, console, Date, Intl, Math, Number, String, JSON, Array, Set, Map, encodeURIComponent, escapeHtml:(v)=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])),
  CHANNELS:[
    {id:'bible-stories-3d',name:'Bible Stories 3D'},
    {id:'daily-faith-inspiration',name:'Daily Faith & Inspiration'},
    {id:'bible-facts-mysteries',name:'Bible Facts & Mysteries'}
  ],
  analyticsSnapshots:[{
    channelId:'bible-stories-3d',periodDays:30,fetchedAt:Date.now(),
    views:1200,watchTimeMinutes:450,subscribersGained:25,subscribersLost:3,channelSubscriberCount:500,
    thumbnailImpressions:8000,thumbnailCtrPercent:4.5,estimatedRevenueMicros:null,
    dailyRowsJson:JSON.stringify([{date:'2026-11-14',views:1200,watchTimeMinutes:450,likes:80,subscribersGained:25,subscribersLost:3}]),
    trafficSourcesJson:JSON.stringify([{sourceType:'SHORTS',views:900,engagedViews:700,watchTimeMinutes:300}]),
    topCountriesJson:JSON.stringify([{countryCode:'ID',views:1000,engagedViews:800,watchTimeMinutes:400}]),
    deviceBreakdownJson:JSON.stringify([{deviceType:'MOBILE',views:1100,engagedViews:900,watchTimeMinutes:420}]),
    operatingSystemsJson:JSON.stringify([{operatingSystem:'ANDROID',views:1000,engagedViews:850,watchTimeMinutes:400}]),
    videoReachJson:JSON.stringify([{videoId:'v1',title:'Daud dan Goliat',impressions:8000,ctrPercent:4.5}]),
    topVideosJson:JSON.stringify([{videoId:'v1',title:'Daud dan Goliat',watchUrl:'https://www.youtube.com/watch?v=v1',channelName:'Bible Stories 3D',currentPublicStats:{views:900},periodMetrics:{views:800,engagedViews:700,averageViewDurationSeconds:34,averageViewPercentage:70},retentionCurve:[{audienceWatchRatio:0.9},{audienceWatchRatio:0.8},{audienceWatchRatio:0.7}]}])
  }],
  savedReports:[{reportType:'production',generatedAt:Date.now(),videosUploaded:2,title:'Produksi',periodStart:'2026-11-01',periodEnd:'2026-11-15',summary:'2 video selesai'}],
  channelConnections:{'bible-stories-3d':{connectionStatus:'connected'}},
};
vm.createContext(ctx); vm.runInContext(source,ctx,{timeout:2000});
for(const id of ['analyticsTotalViews','analyticsTotalWatch','analyticsNetSubscribers','analyticsCurrentSubscribers','analyticsTotalImpressions','analyticsAverageCtr','analyticsDailyRows','analyticsTrafficRows','analyticsCountryRows','analyticsDeviceRows','analyticsOsRows','analyticsReachRows','analyticsTopVideos','analyticsReportHistory']){
  if(!elements[id] || (!elements[id].textContent && !elements[id].innerHTML)) throw new Error('empty dashboard output: '+id);
}
console.log('DASHBOARD ANALYTICS RENDER TEST: PASS');
console.log({views:elements.analyticsTotalViews.textContent,watch:elements.analyticsTotalWatch.textContent,netSubscribers:elements.analyticsNetSubscribers.textContent,currentSubscribers:elements.analyticsCurrentSubscribers.textContent,impressions:elements.analyticsTotalImpressions.textContent,ctr:elements.analyticsAverageCtr.textContent,trafficRows:elements.analyticsTrafficRows.innerHTML,countryRows:elements.analyticsCountryRows.innerHTML});
