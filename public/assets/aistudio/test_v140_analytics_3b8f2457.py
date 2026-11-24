import os, sys, types, tempfile
from pathlib import Path
from datetime import date
ROOT=Path(__file__).resolve().parents[1]
tmp=Path(tempfile.mkdtemp(prefix='aicf-analytics-test-'))
os.environ['LOCALAPPDATA']=str(tmp/'local')
sys.path.insert(0,str(ROOT/'worker'))
import worker
worker.TASK_DB=tmp/'test.sqlite3'; worker.init_workforce_db()
worker.is_sunday=lambda: False
worker.connections['bible-stories-3d']={'ownerUid':'owner1','status':'connected','youtubeChannelId':'UC_TEST','connectedGoogleEmail':'channel@example.com'}
class Creds: _aicf_granted_scopes=worker.SCOPES
worker.get_saved_youtube_credentials=lambda channel: Creds()

class Req:
    def __init__(self, val): self.val=val
    def execute(self): return self.val
class AnalyticsReports:
    def query(self, **kwargs):
        dim=kwargs.get('dimensions','')
        metrics=kwargs.get('metrics','')
        flt=kwargs.get('filters','')
        if dim=='day':
            return Req({'columnHeaders':[{'name':'day'},{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'},{'name':'averageViewDuration'},{'name':'averageViewPercentage'},{'name':'likes'},{'name':'comments'},{'name':'shares'},{'name':'subscribersGained'},{'name':'subscribersLost'}], 'rows':[['2026-11-14',100,80,50,30,60,5,2,1,3,1]]})
        if dim=='insightTrafficSourceType':
            return Req({'columnHeaders':[{'name':'insightTrafficSourceType'},{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'}], 'rows':[['SHORTS',80,65,40],['YT_SEARCH',20,15,10]]})
        if dim=='country':
            return Req({'columnHeaders':[{'name':'country'},{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'}], 'rows':[['ID',70,55,35],['US',30,25,15]]})
        if dim=='deviceType':
            return Req({'columnHeaders':[{'name':'deviceType'},{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'}], 'rows':[['MOBILE',90,70,45],['DESKTOP',10,10,5]]})
        if dim=='operatingSystem':
            return Req({'columnHeaders':[{'name':'operatingSystem'},{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'}], 'rows':[['ANDROID',60,50,30],['IOS',40,30,20]]})
        if dim=='elapsedVideoTimeRatio':
            return Req({'rows':[[0.1,0.9,1.1],[0.2,0.8,1.0],[0.3,0.7,0.9]]})
        if flt.startswith('video=='):
            return Req({'columnHeaders':[{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'},{'name':'averageViewDuration'},{'name':'averageViewPercentage'},{'name':'likes'},{'name':'comments'},{'name':'shares'}], 'rows':[[80,65,40,32,62,4,2,1]]})
        return Req({'columnHeaders':[{'name':'views'},{'name':'engagedViews'},{'name':'estimatedMinutesWatched'},{'name':'averageViewDuration'},{'name':'averageViewPercentage'},{'name':'likes'},{'name':'comments'},{'name':'shares'},{'name':'subscribersGained'},{'name':'subscribersLost'}], 'rows':[[100,80,50,30,60,5,2,1,3,1]]})
class Analytics:
    def reports(self): return AnalyticsReports()
class YoutubeChannels:
    def list(self, **kwargs): return Req({'items':[{'id':'UC_TEST','snippet':{'title':'Bible Stories 3D'},'statistics':{'subscriberCount':'1234'},'contentDetails':{'relatedPlaylists':{'uploads':'UPLOADS'}}}]})
class YoutubePlaylistItems:
    def list(self, **kwargs): return Req({'items':[{'contentDetails':{'videoId':'vid1'}}]})
class YoutubeVideos:
    def list(self, **kwargs): return Req({'items':[{'id':'vid1','snippet':{'title':'Daud dan Goliat','publishedAt':'2026-11-14T00:00:00Z'},'statistics':{'viewCount':'800','likeCount':'40','commentCount':'4'}}]})
class Youtube:
    def channels(self): return YoutubeChannels()
    def playlistItems(self): return YoutubePlaylistItems()
    def videos(self): return YoutubeVideos()
class ReportingReports:
    def list(self, **kwargs): return Req({'reports':[]})
class ReportingJobs:
    def list(self): return Req({'jobs':[{'id':'job1','reportTypeId':'channel_reach_basic_a1'}]})
    def reports(self): return ReportingReports()
class Reporting:
    def reportTypes(self):
        class T:
            def list(self): return Req({'reportTypes':[{'id':'channel_reach_basic_a1'}]})
        return T()
    def jobs(self): return ReportingJobs()
class FakeSession:
    def __init__(self, creds): pass
    def get(self,*args,**kwargs): raise AssertionError('no download expected')

def fake_build(api, version, credentials=None, cache_discovery=False):
    if api=='youtube': return Youtube()
    if api=='youtubeAnalytics': return Analytics()
    if api=='youtubereporting': return Reporting()
    raise AssertionError(api)
modg=types.ModuleType('googleapiclient'); modg.__path__=[]
modd=types.ModuleType('googleapiclient.discovery'); modd.build=fake_build
sys.modules['googleapiclient']=modg; sys.modules['googleapiclient.discovery']=modd
for name in ['google','google.auth','google.auth.transport','google.auth.transport.requests']:
    m=types.ModuleType(name)
    if name in ['google','google.auth','google.auth.transport']: m.__path__=[]
    sys.modules[name]=m
sys.modules['google.auth.transport.requests'].AuthorizedSession=FakeSession

result=worker.sync_youtube_analytics('bible-stories-3d','owner1',30)
assert result['summary']['views']==100,result
assert result['summary']['netSubscribers']==2,result
assert result['channelSubscriberCount']==1234,result
assert result['trafficSources'][0]['sourceType']=='SHORTS',result
assert result['topCountries'][0]['countryCode']=='ID',result
assert result['deviceBreakdown'][0]['deviceType']=='MOBILE',result
assert result['operatingSystems'][0]['operatingSystem']=='ANDROID',result
assert result['topVideos'][0]['periodMetrics']['averageViewPercentage']==62,result
assert len(result['topVideos'][0]['retentionCurve'])==3,result
assert result['reach']['status']=='pending',result
print('ANALYTICS MOCK TEST: PASS')
print({k:result[k] for k in ['channelName','periodStart','periodEnd','summary','channelSubscriberCount','trafficSources','topCountries','deviceBreakdown','operatingSystems','reach','warnings']})
