# Le jingle de base : vrais sons de cassette (BigSoundBank n° 0571 et 0567, CC0, Joseph SARDIN) fondus dans l'accord de
# l'ancien jingle, et le néon de l'enseigne (synthèse) calé dessus.
# ANCIENNES VERSIONS du jingle (accord fondu, bande qui se lance) : gardées pour leurs outils, repris par gonflement.py, qui
# fabrique le jingle retenu.
# Il faut : ../dl/0571.wav et ../dl/0567.wav (téléchargés depuis les pages citées dans ci/licences/Jingle-CREDITS.txt),
# accord.wav, accord_bande.wav, accord_bande_haut.wav et montee.wav (les .pulse rendus avec le moteur Pulse), ffmpeg, numpy,
# scipy ; les .ogg sortent dans ../livrables/.
import subprocess,numpy as np,wave
from scipy import signal
src=open('cassette.py').read(); exec(src[:src.index("K=L(D+'0571.wav')")])
rng=np.random.default_rng(7)
K=L(D+'0571.wav'); R=L(D+'0567.wav'); acc=L('accord.wav',2)*0.8; montee=L('montee.wav',2)*0.8
CLAC=0.6
def filt(x,f,typ='low',o=2): b,a=signal.butter(o,f/(SR/2),typ); return signal.lfilter(b,a,x,axis=0)
def reverb(x,dur=0.7,wet=0.15):
    n=int(dur*SR); ir=rng.standard_normal((n,2))*np.exp(-np.arange(n)/(0.18*SR))[:,None]; ir=filt(ir,5000); ir/=np.sqrt((ir**2).sum(0))
    w=np.stack([signal.fftconvolve(x[:,c],ir[:,c])[:len(x)] for c in (0,1)],1); return x+wet*w
def st(s): return np.stack([s,s],1) if s.ndim==1 else s
ins_court=np.concatenate([seg(K,2.30,2.74),seg(K,3.57,3.86)]); ins_court*=gain_env(len(ins_court),[(0,2.6),(0.42,2.6),(0.45,CLAC),(2,CLAC)])
def rembob(duree_lente,duree_rapide,acc0,acc1,boost=4.5,clac=CLAC,queue=0.0):
    touche=seg(R,0.0,0.30,0.002,0.03)*0.9
    lent=seg(R,0.30,0.30+duree_lente,0.03,0.04); rapide=seg(R,3.52-duree_rapide,3.52,0.04,0.004)
    moteur=varispeed(raccord(lent,rapide,0.04),acc0,acc1,1.3); n=len(moteur); moteur*=boost*np.interp(np.arange(n)/n,[0,0.08,1],[0.5,0.85,1.15])
    c=seg(R,3.52,3.86,0.002,0.05)*clac
    tc=len(touche)+len(moteur)-int(0.03*SR)+int(0.035*SR)
    out=np.concatenate([raccord(touche,moteur,0.03),c,np.zeros(int(queue*SR)+1)])
    if queue>0:   # le moteur ne s'arrête pas net : sa fin, relue à l'envers puis à l'endroit, s'éteint sous l'accord
        m=moteur[-int(0.45*SR):]; q=np.concatenate([m[::-1],m])[:int(queue*SR)]; q=filt(q,1800)*np.linspace(1,0,len(q))**2*0.8
        i=len(touche)+len(moteur)-int(0.03*SR); out[i:i+len(q)]+=q
    return out,tc
def cassette2(nom,pre,gpre,clac,queue,wet,gmontee,att,neon=None,fin=3.85):
    r,tc=rembob(0.75,1.6,1.0,1.45,clac=CLAC*clac,queue=queue); t0=0.03+len(ins_court)/SR+0.05; tclac=t0+tc/SR; ta=tclac+0.02
    cas=np.zeros((int((ta+fin)*SR),2)); poser(cas,ins_court,0.03); poser(cas,r,t0)
    cas=reverb(filt(cas,9000),0.7,wet)                      # même pièce que l'accord, aigus un peu adoucis
    p=cas.copy()
    a=acc.copy(); n=int(att*SR); a[:n]*=np.linspace(0,1,n)[:,None]**0.7   # attaque de l'accord adoucie
    poser(p,a,ta)
    # l'accord naît sous la fin du rembobinage : sa tenue, assourdie, qui monte doucement jusqu'à l'attaque
    npre=int(pre*SR); tenue=filt(acc[int(0.35*SR):int(0.35*SR)+npre],1100)*(np.linspace(0,1,npre)**2)[:,None]*gpre
    m=int(0.06*SR); tenue[-m:]*=np.linspace(1,0,m)[:,None]; poser(p,tenue,ta-pre+0.03)
    if gmontee: poser(p,montee[:int(0.78*SR)]*gmontee,ta-0.75)   # un peu de la montée de notes d'origine sous le moteur
    if neon is not None: poser(p,neon(ta),0)
    return p,ta
# ---- le néon (synthèse) : claquements secs sur chaque faux départ, bourdonnement qui monte, « tchak » de l'allumage, ronron qui retombe
ECLAIRS=[(-2250,-2215),(-1700,-1675),(-1640,-1570),(-1150,-1120),(-690,-655),(-535,-510),(-480,-405),(-295,-270),(-230,-205),(-175,-70)]
def neon_piste(tf,total,avant=2.32,g_bourdon=1.0,g_clac=1.0,g_tchak=1.0,g_ronron=1.0,F0=50.0,tonal=1.0):
    n=int(total*SR); t=np.arange(n)/SR; x=np.zeros((n,2))
    def bourdon(f0,harm): return sum(np.sin(2*np.pi*f0*h*t+ph)/h**e for h,e,ph in harm)
    b=bourdon(F0,[(2,0.3,0),(3,0.8,1),(4,0.7,2),(6,0.9,.5),(8,1.0,1.3),(12,1.1,.2)])*(1+0.25*np.sin(2*np.pi*F0*t))   # F0 = do 1 : ses harmoniques sont des do et des sol, comme l'accord
    # le bourdonnement grave qui monte avant l'allumage
    env=np.clip((t-(tf-avant))/avant,0,1)**2.2*(t<tf); x+=(filt(b,700)*env*0.035*g_bourdon)[:,None]
    # chaque éclair : un claquement sec (étincelle), le tube qui bourdonne tant qu'il est allumé, un petit tic à l'extinction
    for k,(a,bb) in enumerate(ECLAIRS):
        ta_,tb_=tf+a/1000,tf+bb/1000
        if ta_<tf-avant-0.01: continue
        i=int(ta_*SR); d=int(0.022*SR); e=rng.standard_normal(d)*np.exp(-np.arange(d)/(0.004*SR)); e=filt(filt(e,1500,'high'),7000)
        pan=0.5+0.35*np.sin(k*2.4); x[i:i+d,0]+=e*0.30*g_clac*(1-pan); x[i:i+d,1]+=e*0.30*g_clac*pan
        on=((t>=ta_)&(t<tb_)).astype(float); on=np.convolve(on,np.ones(96)/96,'same'); x+=(filt(b,2500)*on*0.05*g_clac)[:,None]
        j=int(tb_*SR); d2=int(0.008*SR); x[j:j+d2]+=(filt(rng.standard_normal(d2),3000,'high')*np.exp(-np.arange(d2)/(0.002*SR))*0.10*g_clac)[:,None]
    # le « tchak » de l'allumage franc : étincelle large, coup grave du transformateur, petit tintement du verre
    i=int(tf*SR); d=int(0.09*SR); e=rng.standard_normal((d,2))*np.exp(-np.arange(d)/(0.012*SR))[:,None]; x[i:i+d]+=filt(filt(e,400,'high'),8000)*0.40*g_tchak
    d=int(0.25*SR); tt=np.arange(d)/SR; x[i:i+d]+=(np.sin(2*np.pi*(46*tt+30*(1-np.exp(-tt/0.03))*0.03))*np.exp(-tt/0.07)*0.30*g_tchak*tonal)[:,None]
    d=int(0.3*SR); tt=np.arange(d)/SR; x[i:i+d]+=(np.sin(2*np.pi*2350*tt)*np.exp(-tt/0.05)*0.03*g_tchak*tonal)[:,None]
    # le ronron du néon allumé, qui retombe
    env=(t>=tf)*np.exp(-np.clip(t-tf,0,None)/0.55)*(0.35+0.65*np.exp(-np.clip(t-tf,0,None)/0.12)); x+=(filt(b,1800)*env*0.085*g_ronron)[:,None]
    return reverb(x,0.5,0.10)
# ---- l'accord qui démarre comme une bande qu'on lance : la touche lecture (le clac), puis la vitesse et la hauteur montent
# ensemble de très bas jusqu'à la note juste (même enregistrement lu de plus en plus vite), avec un pleurage qui se calme,
# et le volume en crescendo ; vitesse normale et plein volume arrivent en même temps, puis la note tient 2 s.
def niveler(src,fen=0.09,maxi=2.0):
    # la tenue d'un accord de dents de scie désaccordées « respire » (battements) : on égalise son niveau, pour une bande stable
    n=int(fen*SR); e=np.sqrt(signal.fftconvolve((src**2).mean(1),np.ones(n)/n,'same')+1e-9); cible=np.median(e[int(0.5*SR):int(3.0*SR)])
    g=np.clip(cible/e,1/maxi,maxi); g=signal.fftconvolve(g,np.hanning(n)/np.hanning(n).sum(),'same'); return src*g[:,None]
def bande_lancee(src,dur,v0=0.2,tenue=2.0,debut=0.45):
    # UNE seule bande : la tenue de l'accord (après son attaque, toutes les voix déjà là, niveau égalisé), lue avec UNE courbe de
    # vitesse continue (de v0 à 1, pente nulle à l'arrivée, pleurage qui s'éteint) et UNE courbe de volume qui ne fait que monter
    # jusqu'à l'arrivée (pente nulle aussi) ; ensuite la même bande continue à vitesse normale. Rien n'entre, rien n'est réattaqué.
    n=int(dur*SR); x=np.arange(n)/n; t=np.arange(n)/SR
    v=v0+(1-v0)*(1-(1-x)**2.4)
    v*=1+0.035*(1-x)**2*np.sin(2*np.pi*6.5*t)+0.01*(1-x)**2*np.sin(2*np.pi*23*t)
    pos=np.cumsum(v); mange=pos[-1]/SR
    # la fin de la tenue (début de l'extinction) est fixe dans le rendu (3,5 s) : on part assez tard pour qu'il reste « tenue » s après l'arrivée
    d0=max(debut,3.5-mange-tenue); s0=niveler(src)[int(d0*SR):]
    deb=np.stack([np.interp(pos,np.arange(len(s0)),s0[:,c]) for c in (0,1)],1)*(0.2+0.8*np.sin(x*np.pi/2)**1.5)[:,None]
    m=int(0.03*SR); deb[:m]*=np.sin(np.linspace(0,np.pi/2,m))[:,None]
    k=pos[-1]; reste=np.stack([np.interp(k+1+np.arange(len(s0)-int(k)-3),np.arange(len(s0)),s0[:,c]) for c in (0,1)],1)   # (suite exacte, sans saut d'un échantillon)
    return np.concatenate([deb,reste]), mange
def pc(a,b,f=0.03):   # fondu enchaîné à puissance constante
    n=int(f*SR); u=np.linspace(0,np.pi/2,n); return np.concatenate([a[:-n],a[-n:]*np.cos(u)+b[:n]*np.sin(u),b[n:]])
def boucle(m,n,f=0.12):
    out=m.copy()
    while len(out)<n: out=pc(out,m,f)
    return out[:n]
def lancement(nom,dur,src,neon=True):
    # tout s'enchaîne sans trou : insertion → touche → moteur → clac (touche lecture) → la bande démarre SOUS la queue du clac,
    # et un fond continu (souffle de bande dès le début, mécanique de lecture après le clac) tient sous toute la durée
    ins=pc(seg(K,2.30,2.74,0.004,0.035)*2.6,seg(K,3.565,3.86,0.03,0.04)*CLAC,0.03)
    r,tc=rembob(0.75,1.6,1.0,1.45,clac=CLAC*0.8,queue=0.6); t0=0.03+len(ins)/SR-0.035; tclac=t0+tc/SR
    a,mange=bande_lancee(src,dur); td=tclac-0.01; tf=td+dur            # tf : la note atteint sa vitesse normale
    total=tf+(2.0)+1.85; n=int(total*SR); t=np.arange(n)/SR
    cas=np.zeros((n,2)); poser(cas,ins,0.03); poser(cas,r,t0)
    souffle=filt(filt(rng.standard_normal(n),250,'high'),5500)*0.0045; souffle[:int(0.03*SR)]*=np.sin(np.linspace(0,np.pi/2,int(0.03*SR)))
    meca=boucle(filt(seg(R,0.62,2.15,0.01,0.01),2600)*4.5*0.75,n); u=np.clip((t-(tclac-0.06))/0.09,0,1)
    meca*=np.sin(u*np.pi/2)*(0.3+0.7*np.exp(-np.clip(t-tclac,0,None)/1.6))
    poser(cas,(souffle+meca)*np.interp(t,[tf+1.9,tf+3.5],[1,0.12]),0)   # le fond s'efface avec la résonance de l'accord
    p=reverb(filt(cas,9000),0.7,0.16)
    poser(p,a[:len(p)-int(td*SR)],td)
    if neon: p+=neon_piste(tf,len(p)/SR,g_bourdon=0.35,g_clac=0.75,g_tchak=0.3,g_ronron=0.3,F0=32.703,tonal=0.0)[:len(p)]
    print('  ',nom,': bande lancée à',round(td,3),'s, vitesse normale (JINGLE_FRANC) à',round(tf*1000),'ms ; début mangé',round(mange,2),'s'); finir(p,nom,0.5)
if __name__=='__main__':
    for nom,kw in [('jingle_cassette2_fondu_A',dict(pre=0.6,gpre=0.45,clac=0.65,queue=0.35,wet=0.10,gmontee=0,att=0.05)),
                   ('jingle_cassette2_fondu_B',dict(pre=1.3,gpre=0.75,clac=0.42,queue=0.9,wet=0.18,gmontee=0.45,att=0.09))]:
        p,ta=cassette2(nom,**kw); print('  accord à',round(ta,3)); finir(p,nom,0.5)
    # le jingle complet : dosage B + le néon calé dessus, discret sous la cassette (les claquements jalonnent le rembobinage)
    kw=dict(pre=1.3,gpre=0.75,clac=0.42,queue=0.9,wet=0.18,gmontee=0.45,att=0.09)
    p,ta=cassette2('x',**kw); p+=neon_piste(ta,len(p)/SR,g_bourdon=0.5,g_clac=0.75,g_tchak=0.7,g_ronron=0.6)[:len(p)]; print('  JINGLE_FRANC =',round(ta*1000)); finir(p,'jingle_cassette2_neon',0.5)
    # le néon seul (a) : 0,75 s de faux départs, l'allumage, le ronron qui retombe
    p=neon_piste(0.85,3.6,avant=0.80,g_bourdon=1.3,g_clac=0.9,g_tchak=0.85,g_ronron=0.9); print('  allumage franc à 850 ms'); finir(p,'neon_a',0.5)
    lancement('jingle_cassette2_octave_basse',0.8,L('accord_bande.wav',2)*0.8)
    lancement('jingle_cassette2_octave_origine',0.8,L('accord_bande_haut.wav',2)*0.8)
