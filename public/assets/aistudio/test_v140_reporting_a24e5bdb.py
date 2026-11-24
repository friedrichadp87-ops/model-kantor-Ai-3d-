import os, sys, types, importlib.util, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
temp=Path(tempfile.mkdtemp(prefix='aicf-reporting-test-'))
os.environ['LOCALAPPDATA']=str(temp/'local')
sys.path.insert(0, str(ROOT/'worker'))
import worker
worker.TASK_DB = temp/'test.sqlite3'
worker.init_workforce_db()

class Execute:
    def __init__(self, value): self.value=value
    def execute(self): return self.value

class FakeReportsList:
    def __init__(self, reports, parent): self._reports=reports; self.parent=parent
    def list(self, **kwargs):
        self.parent.list_calls += 1
        return Execute({'reports': list(self._reports)})
class FakeReports:
    def __init__(self, parent): self.parent=parent
    def list(self, **kwargs):
        self.parent.list_calls += 1
        return Execute({'reports': list(self.parent.reports_data)})
class FakeJobs:
    def __init__(self, parent): self.parent=parent
    def list(self): return Execute({'jobs': [{'id':'job-1','reportTypeId':'channel_reach_basic_a1'}]})
    def create(self, body): return Execute({'id':'job-1','reportTypeId':body['reportTypeId']})
    def reports(self): return FakeReports(self.parent)
class FakeReporting:
    def __init__(self, reports): self.reports_data=reports; self.download_count=0; self.list_calls=0
    def reportTypes(self):
        class T:
            def list(self): return Execute({'reportTypes':[{'id':'channel_reach_basic_a1'}]})
        return T()
    def jobs(self): return FakeJobs(self)

csv_bodies={
 'https://youtubereporting.googleapis.com/file1': b'date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-11-14,UC_TEST,vid1,100,2.5\n2026-11-14,UC_TEST,vid2,300,4.0\n',
 'https://youtubereporting.googleapis.com/file2': b'date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-11-14,UC_TEST,vid1,150,3.0\n',
 'https://youtubereporting.googleapis.com/empty': b'date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n'
}

class FakeResponse:
    def __init__(self, body): self.body=body
    def raise_for_status(self): pass
    def iter_content(self, chunk_size=1000):
        for i in range(0,len(self.body),chunk_size): yield self.body[i:i+chunk_size]
class FakeSession:
    def __init__(self, creds): pass
    def get(self,url,**kwargs):
        reporting.download_count += 1
        return FakeResponse(csv_bodies[url])

# Fake googleapiclient.discovery.build
reporting=None
def fake_build(api, version, credentials=None, cache_discovery=False):
    if api == 'youtubereporting': return reporting
    raise AssertionError(f'unexpected API {api}')
mod_googleapiclient=types.ModuleType('googleapiclient'); mod_googleapiclient.__path__=[]
mod_discovery=types.ModuleType('googleapiclient.discovery'); mod_discovery.build=fake_build
sys.modules['googleapiclient']=mod_googleapiclient
sys.modules['googleapiclient.discovery']=mod_discovery

# Stub google.auth.transport.requests.AuthorizedSession
mods={}
for name in ['google','google.auth','google.auth.transport','google.auth.transport.requests']:
    m=types.ModuleType(name)
    if name in ['google','google.auth','google.auth.transport']: m.__path__=[]
    sys.modules[name]=m; mods[name]=m
sys.modules['google.auth.transport.requests'].AuthorizedSession=FakeSession

from datetime import date
reports=[{'id':'r1','startTime':'2026-11-14T00:00:00Z','endTime':'2026-11-15T00:00:00Z','createTime':'2026-11-15T02:00:00Z','downloadUrl':'https://youtubereporting.googleapis.com/file1'}]
reporting=FakeReporting(reports)
result1=worker.sync_youtube_reach_reporting('bible-stories-3d',object(),date(2026,11,14),date(2026,11,14))
assert result1['status']=='ready', result1
assert result1['impressions']==400, result1
assert result1['reportsImported']==1 and result1['rowsImported']==2, result1
assert abs(result1['ctrPercent']-3.625)<0.0001, result1
assert reporting.download_count==1

# Re-sync must not download the same report again.
result2=worker.sync_youtube_reach_reporting('bible-stories-3d',object(),date(2026,11,14),date(2026,11,14))
assert result2['impressions']==400, result2
assert result2['reportsImported']==0 and reporting.download_count==1, result2

# A replacement report for the same date must replace, not add to, the prior rows.
reporting.reports_data=[{'id':'r2','startTime':'2026-11-14T00:00:00Z','endTime':'2026-11-15T00:00:00Z','createTime':'2026-11-16T02:00:00Z','downloadUrl':'https://youtubereporting.googleapis.com/file2'}]
result3=worker.sync_youtube_reach_reporting('bible-stories-3d',object(),date(2026,11,14),date(2026,11,14))
assert result3['impressions']==150, result3
assert result3['reportsImported']==1 and reporting.download_count==2, result3
assert abs(result3['ctrPercent']-3.0)<0.0001, result3

# Empty files are also marked imported and are not repeatedly downloaded.
reporting.reports_data=[{'id':'r3','startTime':'2026-11-14T00:00:00Z','endTime':'2026-11-15T00:00:00Z','createTime':'2026-11-16T03:00:00Z','downloadUrl':'https://youtubereporting.googleapis.com/empty'}]
result4=worker.sync_youtube_reach_reporting('daily-faith-inspiration',object(),date(2026,11,14),date(2026,11,14))
assert result4['status']=='pending', result4
assert result4['reportsImported']==1 and reporting.download_count==3, result4
result5=worker.sync_youtube_reach_reporting('daily-faith-inspiration',object(),date(2026,11,14),date(2026,11,14))
assert result5['reportsImported']==0 and reporting.download_count==3, result5
print('REPORTING MOCK TEST: PASS')
print('initial import:', result1)
print('dedupe:', result2)
print('replacement:', result3)
print('empty report tracking:', result5)
