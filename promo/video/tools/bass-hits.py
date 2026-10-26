import sys, json, numpy as np, librosa
f=sys.argv[1]; d=json.load(open(sys.argv[2]))
y, sr = librosa.load(f, sr=22050, mono=True)
hop=256
S=np.abs(librosa.stft(y,n_fft=2048,hop_length=hop))**2
fr=librosa.fft_frequencies(sr=sr,n_fft=2048)
lo=S[fr<120].sum(0); lo_db=10*np.log10(lo+1e-9)
env=np.maximum(0,np.diff(lo_db,prepend=lo_db[0]))
peaks=librosa.util.peak_pick(env,pre_max=8,post_max=8,pre_avg=20,post_avg=20,delta=4,wait=10)
t=peaks*hop/sr
lvl=lo_db[np.minimum(peaks+6,len(lo_db)-1)]
beats=np.array(d['beat_frames'])/30.0
out=[]
for ti,lv,st in zip(t,lvl,env[peaks]):
    # nearest beat / half-beat
    j=np.argmin(abs(beats-ti)); half=None
    out.append(dict(t=round(float(ti),3),strength=round(float(st),1),level=round(float(lv),1),beat=int(j),off_ms=round(float((ti-beats[j])*1000))))
json.dump(out,open(sys.argv[3],'w'))
