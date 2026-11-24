import os,sys,tempfile,subprocess,wave,math,struct
from pathlib import Path
from PIL import Image
base=Path(tempfile.mkdtemp(prefix='aicf-qc-test-'))
os.environ['LOCALAPPDATA']=str(base/'local')
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'worker'))
import worker

# Valid audio WAV
wavp=base/'voice.wav'; sr=16000; duration=25
with wave.open(str(wavp),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr)
    w.writeframes(b''.join(struct.pack('<h',int(9000*math.sin(2*math.pi*440*i/sr))) for i in range(sr*duration)))

# Valid asset CC0 and image integrity
img=base/'asset.jpg'; Image.new('RGB',(512,512),(80,120,160)).save(img,quality=95)
asset={'localFile':str(img),'license':'CC0','sourceUrl':'https://images.example.test/asset','creator':'','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/'}

# Valid MP4 and subtitles
mp4=base/'valid.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=blue:s=720x1280:r=30:d=25','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=25','-c:v','libx264','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','128k','-shortest',str(mp4)],check=True)
scenes=[{'narrationSegment':f'Kalimat cerita adegan {i} tentang Daud dan Goliat.'} for i in range(1,6)]
narration=' '.join(x['narrationSegment'] for x in scenes)
sub=worker.write_subtitle_and_credit_files(scenes,25,['Kredit visual CC0'],base)['subtitleFile']
# Current QC requires real visual coverage on at least half of scenes.
visual_assets=[{**asset,'localFile':str(img)} for _ in range(3)]
q=worker.run_advanced_quality_checks(mp4,wavp,Path(sub),{'width':720,'height':1280,'fps':30,'durationSeconds':25},scenes,visual_assets,narration,'valid-test','bible-stories-3d')
assert q['passed'], q['blockers']
assert q['video']['videoCodec']=='h264' and q['video']['audioCodec']=='aac',q['video']
assert q['license']['checkedAssets']==3 and q['license']['passed'],q['license']

# Invalid SRT overlap must fail.
bad_srt=base/'bad.srt'
bad_srt.write_text('1\n00:00:00,000 --> 00:00:10,000\nKalimat pertama\n\n2\n00:00:05,000 --> 00:00:15,000\nKalimat kedua\n\n3\n00:00:15,000 --> 00:00:20,000\nKalimat ketiga\n',encoding='utf-8')
bad=worker.inspect_subtitle_file(bad_srt,3,25,'kalimat pertama kalimat kedua kalimat ketiga')
assert not bad['passed'] and bad['overlapCount']>0,bad

# Wrong asset license should fail.
invalid_license=worker.inspect_asset_licenses([{**asset,'license':'ALL_RIGHTS_RESERVED'}])
assert not invalid_license['passed'] and invalid_license['issues'],invalid_license

# 24/7 policy must allow work on Sunday; only intentional Worker shutdown blocks it.
old=worker.is_sunday
worker.is_sunday=lambda:True
try:
    worker.assert_working_day()
finally:
    worker.is_sunday=old
worker.WORKER_STOP.set()
try:
    try:
        worker.assert_working_day()
        raise AssertionError('Worker shutdown guard did not block work')
    except RuntimeError as exc:
        assert 'Worker sedang ditutup' in str(exc)
finally:
    worker.WORKER_STOP.clear()

print('QC PASS TEST: valid MP4/audio/SRT/CC0 image accepted')
print('QC NEGATIVE TEST: overlapping subtitles rejected')
print('QC NEGATIVE TEST: invalid asset license rejected')
print('24/7 OPERATIONS TEST: Sunday work allowed; intentional Worker shutdown blocked')
