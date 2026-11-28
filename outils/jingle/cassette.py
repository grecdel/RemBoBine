# Jingles faits de vrais enregistrements de lecteur de cassettes (BigSoundBank, CC0, Joseph SARDIN : sons n° 0571 et 0567).
import subprocess,numpy as np,wave,sys
SR=48000; D='../dl/'
def L(p,ch=1):
    x=np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',p,'-ac',str(ch),'-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout,np.float32).astype(np.float64)
    return x if ch==1 else x.reshape(-1,2)
def seg(x,a,b,fi=0.004,fo=0.02):
    s=x[int(a*SR):int(b*SR)].copy(); n=int(fi*SR); m=int(fo*SR); s[:n]*=np.linspace(0,1,n); s[-m:]*=np.linspace(1,0,m); return s
def gain_env(n,points):   # points : (t, gain), interpolés
    t=np.arange(n)/SR; return np.interp(t,[p[0] for p in points],[p[1] for p in points])
def varispeed(s,v0,v1,courbe=1.0):
    n=len(s); x=np.linspace(0,1,n); v=v0+(v1-v0)*x**courbe; pos=np.cumsum(v); pos=pos[pos<n-1]; return np.interp(pos,np.arange(n),s)
def raccord(a,b,f=0.03):
    n=int(f*SR); return np.concatenate([a[:-n],a[-n:]*np.linspace(1,0,n)+b[:n]*np.linspace(0,1,n),b[n:]])
def poser(piste,s,t,g=1.0):
    i=int(t*SR); 
    if s.ndim==1: s=np.stack([s,s],1)
    piste[i:i+len(s)]+=s[:len(piste)-i]*g
def finir(piste,nom,fondu=0.4):
    piste=np.tanh(piste*1.0); n=int(fondu*SR); piste[-n:]*=np.linspace(1,0,n)[:,None]
    pcm=(np.clip(piste,-1,1)*32767).astype(np.int16); w=wave.open(nom+'.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
    subprocess.run(['ffmpeg','-v','error','-y','-i',nom+'.wav','-c:a','libopus','-b:a','64k','../livrables/'+nom+'.ogg'],check=True)
    e=np.sqrt((piste[:len(piste)//4800*4800].reshape(-1,9600)**2).mean(1)); print(nom,round(len(piste)/SR,2),'s pic',abs(piste).max().round(2)); print('  ',' '.join(map(str,np.round(20*np.log10(e+1e-6)).astype(int))))
K=L(D+'0571.wav'); R=L(D+'0567.wav'); acc=L('accord.wav',2)*0.8
CLAC=0.6   # niveau des clacs (les enregistrements sont à 0,99)
# --- la cassette qu'on glisse dans le logement, puis le volet qu'on referme
ins_long=np.concatenate([seg(K,2.28,3.08),np.zeros(int(0.06*SR)),seg(K,3.33,3.86)])
g=gain_env(len(ins_long),[(0,2.6),(0.80,2.6),(0.86,1.6),(1.05,1.6),(1.10,CLAC),(2,CLAC)]); ins_long*=g
ins_court=np.concatenate([seg(K,2.30,2.74),seg(K,3.57,3.86)]); ins_court*=gain_env(len(ins_court),[(0,2.6),(0.42,2.6),(0.45,CLAC),(2,CLAC)])
# --- la touche « rembobiner », le moteur, la bande qui arrive au bout (clac : la touche saute)
def rembob(duree_lente,duree_rapide,acc0=1.0,acc1=1.0,boost=4.5):
    touche=seg(R,0.0,0.30,0.002,0.03)*0.9
    lent=seg(R,0.30,0.30+duree_lente,0.03,0.04); rapide=seg(R,3.52-duree_rapide,3.52,0.04,0.004)
    moteur=raccord(lent,rapide,0.04) if duree_lente>0.1 else rapide
    if acc1!=acc0: moteur=varispeed(moteur,acc0,acc1,1.3)
    n=len(moteur); moteur*=boost*np.interp(np.arange(n)/n,[0,0.08,1],[0.5,0.85,1.15])
    clac=seg(R,3.52,3.86,0.002,0.05)*CLAC
    return np.concatenate([raccord(touche,moteur,0.03),clac]), len(touche)+len(moteur)-int(0.03*SR)+int(0.035*SR)   # (son, instant du clac)
# 1 — sons seuls, tels quels (coupes et niveaux seulement)
r,_=rembob(1.95,1.22); p=np.zeros((int(5.6*SR),2)); poser(p,ins_long,0.05); poser(p,r,0.05+len(ins_long)/SR+0.08); finir(p,'jingle_vraie_cassette_1')
# 2 — sons + accord final : insertion courte, rembobinage qui accélère, l'accord tombe sur le clac de fin de bande
r,tc=rembob(0.75,1.6,1.0,1.45); t0=0.03+len(ins_court)/SR+0.05; tclac=t0+tc/SR
p=np.zeros((int((tclac+3.85)*SR),2)); poser(p,ins_court,0.03); poser(p,r,t0); poser(p,acc,tclac+0.02); print('   accord à',round(tclac+0.02,2),'s'); finir(p,'jingle_vraie_cassette_2',0.5)
# 3 — sons seuls, rembobinage dont la vitesse monte franchement (même enregistrement, lu de plus en plus vite)
r,_=rembob(1.95,1.22,0.85,1.9); p=np.zeros((int((0.05+len(ins_long)/SR+0.08+len(r)/SR+0.35)*SR),2)); poser(p,ins_long,0.05); poser(p,r,0.05+len(ins_long)/SR+0.08); finir(p,'jingle_vraie_cassette_3')
