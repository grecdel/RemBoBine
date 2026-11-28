# Nouveau jingle (essais) : 1) la cassette qu'on insère (vrai enregistrement) ; 2) le moteur se met en route, discret (vrai
# moteur, lu de plus en plus vite puis stable, privé de son ronflement pour ne pas faire une note) ; 3) UNE note naît dessous,
# très très fondue, enfle jusqu'à son plein, tient, s'éteint ; 4) un grésillement de néon léger et continu en fond (bruit
# sans hauteur). Ni rembobinage rapide, ni clac de fin de bande, ni accord, ni cloche.
# LE JINGLE DE L'APPLI est fabriqué par jingle_n3() (jingle_note3.ogg, JINGLE_SRC de web/index.html ; JINGLE_FRANC = l'instant du
# plein de la note affiché à la fin) : version choisie par le propriétaire le 28 nov. 2026. Outils repris de gonflement.py,
# jingle.py et cassette.py (anciennes versions, mêmes fichiers d'entrée). python3 note.py
import subprocess,numpy as np,wave,re
from scipy import signal
src=open('gonflement.py').read(); exec(src[:src.rindex("if __name__=='__main__':")])
MI2=82.407
def lufs_st(p):
    w=wave.open('tmp_n.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(p,-1,1)*32767).astype(np.int16).tobytes()); w.close()
    o=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i','tmp_n.wav','-af','ebur128','-f','null','-'],capture_output=True,text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS',o)[-1])
def note(f0,gonfle=2.4,tenue=1.8,fin=1.7,glisse=0.0):
    n=int((gonfle+tenue+fin)*SR); t=np.arange(n)/SR; x=np.clip(t/gonfle,0,1); u=np.clip((t-gonfle-tenue)/fin,0,1)
    v=np.ones(n) if not glisse else glisse+(1-glisse)*(1-(1-x)**2.4)       # hauteur fixe (ou : la bande qui prend sa vitesse)
    ph=2*np.pi*np.cumsum(f0*v)/SR
    fc=(90*(2600/90)**(lisse(x)**1.4))*(1-0.55*lisse(u))                  # le timbre : très sombre au départ, il s'ouvre, puis se referme un peu en s'éteignant
    y=np.zeros(n); r=np.random.default_rng(4)
    for k in range(1,int(4800/f0)+1):
        y+=np.sin(k*ph+r.uniform(0,2*np.pi))/k**1.45/(1+(k*f0*v/fc)**2)   # une fondamentale et ses harmoniques exactes, rien d'autre
    env=lisse(x)**2.4*np.cos(u*np.pi/2)**2                                # entrée très fondue (courbe en S partie de rien), tenue, extinction
    y=np.tanh(y/np.abs(y).max()*1.3)                                      # (un rien de rondeur de bande magnétique)
    y*=env; y/=np.sqrt((y[int((gonfle+0.2)*SR):int((gonfle+1.4)*SR)]**2).mean()); return np.stack([y,y],1)*0.14
def jingle_n(nom,f0,glisse=0.0):
    ins=pc(seg(K,2.30,2.74,0.004,0.035)*2.6,seg(K,3.565,3.86,0.03,0.04)*CLAC,0.03)*0.8
    tm=0.03+len(ins)/SR-0.10                       # le moteur démarre sous la fin de l'insertion
    td=1.25; gonfle=2.4; tf=td+gonfle             # la note naît à 1,25 s, imperceptible ; son plein à 3,65 s
    a=note(f0,gonfle,glisse=glisse); n=int(td*SR)+len(a); t=np.arange(n)/SR; p=np.zeros((n,2)); poser(p,ins,0.03)
    # le moteur : la portion calme de l'enregistrement, en boucle, lue de 30 % à 100 % en 0,7 s (il se lance), puis stable
    nm=n-int(tm*SR); xm=np.clip(np.arange(nm)/SR/0.7,0,1); vm=0.3+0.7*(1-(1-xm)**2.2); pos=np.cumsum(vm)
    b=boucle(seg(R,0.62,2.15,0.01,0.01),int(pos[-1])+SR,0.15); mot=np.interp(pos,np.arange(len(b)),b)
    mot=filt(filt(mot,420,'high',4),3200)*4.5*3.0              # sans son ronflement grave : un frottement mécanique, pas une note
    tmm=np.arange(nm)/SR+tm; mot*=lisse((tmm-tm)/0.35)*(1-0.78*lisse((tmm-td-0.5)/(gonfle-0.3)))*np.interp(tmm,[tf+1.8,tf+3.4],[1,0.1])   # il s'installe, puis se retire sous la note
    poser(p,mot,tm)
    s=filt(filt(rng.standard_normal(n),250,'high'),5500)*0.006; s[:int(0.03*SR)]*=np.sin(np.linspace(0,np.pi/2,int(0.03*SR)))
    p+=(s*np.interp(t,[tf+1.8,tf+3.4],[1,0.15]))[:,None]       # le souffle de bande, continu
    # le grésillement du néon, en fond : un crépitement fin et continu (bruit sans hauteur), qui s'intensifie un peu jusqu'à l'allumage puis se calme
    c=np.zeros(n); ii=rng.integers(0,n-10,int(700*n/SR)); c[ii]+=rng.choice([-1,1],len(ii))*rng.uniform(0.2,0.5,len(ii))   # (dense et régulier : un grésillement, pas des claquements)
    c=filt(filt(c,2600,'high'),9000)*0.42+filt(filt(rng.standard_normal(n),3000,'high'),8000)*0.0035*(1+0.6*np.sin(2*np.pi*50*t))
    eg=lisse((t-tm)/0.8)*np.where(t<tf,0.55+0.45*np.clip((t-tm)/(tf-tm),0,1)**2,0.45+0.55*np.exp(-(t-tf)/0.5))*np.interp(t,[tf+1.8,tf+3.4],[1,0.1])
    p[:,0]+=c*eg*0.9; p[:,1]+=np.roll(c,137)*eg*0.9
    poser(p,a,td); p=filt(p,9000)
    g=10**((-14.0-lufs_st(p))/20); p*=g; pic=np.abs(p).max()
    if pic>0.84: i=int(0.9*SR); p[:i]=np.tanh(p[:i]/0.84*1.2)/np.tanh(1.2)*0.84 if np.abs(p[i:]).max()<=0.84 else p[:i]; p=np.clip(p,-0.84,0.84)   # (seuls les claquements de l'insertion sont arrondis s'ils dépassent)
    k=int(0.3*SR); p[-k:]*=np.linspace(1,0,k)[:,None]
    pcm=(p*32767).astype(np.int16); w=wave.open(nom+'.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
    subprocess.run(['ffmpeg','-v','error','-y','-i',nom+'.wav','-c:a','libopus','-b:a','64k','../livrables/'+nom+'.ogg'],check=True)
    print('  ',nom,': plein de la note (JINGLE_FRANC) à',round(tf*1000),'ms ; durée',round(n/SR,2),'s ;',round(lufs_st(p),1),'LUFS ; crête',round(20*np.log10(np.abs(p).max()),1),'dBFS (avant arrondi :',round(20*np.log10(pic),1),')')
# ---- la version retenue (28 nov. 2026), 5,15 s : la même en plus court, avec la mise en route du moteur et une fin très lisse
def jingle_n3(nom,f0=MI2*2,gonfle=1.75,tenue=0.9,fin=1.5):
    ins=pc(seg(K,2.30,2.74,0.004,0.035)*2.6,seg(K,3.565,3.86,0.03,0.04)*CLAC,0.03)*0.8
    tm=0.03+len(ins)/SR-0.12; td=0.95; tf=td+gonfle; fin_t=tf+tenue           # le moteur démarre sous la fin de l'insertion ; la note naît à 0,95 s
    a=note(f0,gonfle,tenue,fin); n=int(td*SR)+len(a)+int(0.05*SR); t=np.arange(n)/SR; p=np.zeros((n,2)); poser(p,ins,0.03)
    sortie=np.cos(np.clip((t-fin_t)/fin,0,1)*np.pi/2)**2                       # tout se retire avec la note, sur la même courbe douce, jusqu'au silence
    # la mise en route : la bobine et le moteur ont de l'inertie — départ lent, la rotation prend sa vitesse en 0,75 s (hauteur et
    # rythme mécanique montent ensemble), avec un petit à-coup sourd de l'entraînement au départ, sans clac
    nm=n-int(tm*SR); tmm=np.arange(nm)/SR; xm=np.clip(tmm/0.75,0,1); vm=0.16+0.84*(1-(1-xm)**2.0); pos=np.cumsum(vm)
    b=boucle(seg(R,0.62,2.15,0.01,0.01),int(pos[-1])+SR,0.15); brut=np.interp(pos,np.arange(len(b)),b)*4.5*3.0
    haut=filt(filt(brut,420,'high',4),3200)                                    # le frottement mécanique (sans ronflement : pas une note)
    lance=filt(filt(brut,110,'high',2),420,'low',4)*0.55*(1-lisse((tmm-0.75)/0.9))   # le ronflement du moteur qui monte, seulement pendant qu'il se lance
    tour=1+0.3*(1-lisse((tmm-0.5)/0.6))*np.sin(2*np.pi*np.cumsum(2.2+7.5*xm)/SR)     # la bobine qui se met à tourner : un battement qui accélère, puis s'efface
    mot=(haut*0.8*tour+lance)*lisse(tmm/0.22)*(1-0.7*lisse((tmm+tm-td-0.7)/(gonfle-0.5)))
    d=int(0.11*SR); tt=np.arange(d)/SR; acoup=filt(rng.standard_normal(d),160,'low',3)*np.sin(np.pi*tt/0.11)**2*0.9; mot[int(0.02*SR):int(0.02*SR)+d]+=acoup*0.05*4.5
    poser(p,mot,tm)
    s=filt(filt(rng.standard_normal(n),250,'high'),5500)*0.006; s[:int(0.03*SR)]*=np.sin(np.linspace(0,np.pi/2,int(0.03*SR)))
    c=np.zeros(n); ii=rng.integers(0,n-10,int(700*n/SR)); c[ii]+=rng.choice([-1,1],len(ii))*rng.uniform(0.2,0.5,len(ii))
    c=filt(filt(c,2600,'high'),9000)*0.42+filt(filt(rng.standard_normal(n),3000,'high'),8000)*0.0035*(1+0.6*np.sin(2*np.pi*50*t))
    eg=lisse((t-tm)/0.6)*np.where(t<tf,0.55+0.45*np.clip((t-tm)/(tf-tm),0,1)**2,0.45+0.55*np.exp(-(t-tf)/0.5))
    p[:,0]+=c*eg*0.9; p[:,1]+=np.roll(c,137)*eg*0.9; p+=s[:,None]
    i0=int(fin_t*SR); p[i0:]*=sortie[i0:,None]                                 # (le moteur, le souffle et le grésillement s'éteignent avec la note)
    poser(p,a,td); p=filt(p,9000)
    k=int(0.12*SR); p[-k:]*=(np.cos(np.linspace(0,np.pi/2,k))**2)[:,None]; p[-8:]=0   # fin dans le silence
    p*=10**((-14.0-lufs_st(p))/20)
    pcm=(np.clip(p,-0.89,0.89)*32767).astype(np.int16); w=wave.open(nom+'.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
    subprocess.run(['ffmpeg','-v','error','-y','-i',nom+'.wav','-c:a','libopus','-b:a','64k','../livrables/'+nom+'.ogg'],check=True)
    print('  ',nom,': moteur à',round(tm,2),'s, note née à',td,'s, plein (JINGLE_FRANC) à',round(tf*1000),'ms, fin de tenue',round(fin_t,2),'s ; durée',round(n/SR,2),'s ;',round(lufs_st(p),1),'LUFS ; crête',round(20*np.log10(np.abs(p).max()),1),'dBFS')
if __name__=='__main__':
    jingle_n3('jingle_note3')
