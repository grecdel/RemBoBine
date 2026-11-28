# La fin du jingle en « gonflement » : après la cassette et le clac, le bruit de la lecture s'installe (souffle de bande,
# mécanique), puis l'accord ÉMERGE de ce bruit et enfle en un seul long crescendo — sombre et étouffé d'abord, il s'ouvre
# (le filtre monte, les voix s'ajoutent sans attaque), le bruit se retire dessous, il atteint son plein, tient, s'éteint.
# L'accord est celui d'avant (do majeur, octave basse, avec sa cloche sur sol), mais fabriqué ici voix par voix pour que RIEN
# ne batte ni ne rentre après coup : intervalles purs (sol = 3/2, mi = 5/4), donc toutes les composantes sont des harmoniques
# exactes d'un même do grave et gardent une phase fixe ; le bourdon du néon est accordé sur ce même do. python3 gonflement.py
# (mêmes fichiers d'entrée que jingle.py, dont il reprend les outils ; le fichier de l'appli est jingle_mi_doux_B_sans_claquements.ogg
# — le jingle B validé par le propriétaire le 27 nov. 2026, moins les claquements des faux départs, que l'écran de démarrage joue
# lui-même —, JINGLE_SRC de web/index.html ; l'instant du plein affiché à la fin est JINGLE_FRANC)
import subprocess,numpy as np,wave
from scipy import signal
src=open('jingle.py').read(); exec(src[:src.index("if __name__=='__main__':")])
F1=32.703                                   # do 1 : toutes les hauteurs en sont des multiples entiers
#        nom      multiple  niveau  entrée (part du gonflement où la voix commence à monter)  type
VOIX=[('do 2',2,1.00,0.00,'scie'),('grave',2,1.30,0.00,'sinus'),('sol 2',3,0.85,0.08,'scie'),('do 3',4,0.85,0.14,'scie'),
      ('mi 3',5,0.75,0.22,'scie'),('sol 3',6,0.75,0.28,'scie'),('cloche sol 4',12,0.30,0.40,'sinus'),('cloche sol 5',24,0.10,0.50,'sinus')]
def neon_sec(tf,total,eclairs=True):   # le néon sans aucune hauteur : claquements secs des faux départs, grésillement de bruit pendant l'éclair, étincelle de l'allumage
    n=int(total*SR); t=np.arange(n)/SR; x=np.zeros((n,2)); br=filt(filt(rng.standard_normal(n),1800,'high'),7500)
    for k,(a,bb) in enumerate(ECLAIRS if eclairs else []):
        ta_,tb_=tf+a/1000,tf+bb/1000; i=int(ta_*SR); d=int(0.022*SR); e=rng.standard_normal(d)*np.exp(-np.arange(d)/(0.004*SR)); e=filt(filt(e,1500,'high'),7000)
        pan=0.5+0.35*np.sin(k*2.4); x[i:i+d,0]+=e*0.23*(1-pan); x[i:i+d,1]+=e*0.23*pan
        on=((t>=ta_)&(t<tb_)).astype(float); on=np.convolve(on,np.ones(96)/96,'same'); x+=(br*on*0.012)[:,None]
        j=int(tb_*SR); d2=int(0.008*SR); x[j:j+d2]+=(filt(rng.standard_normal(d2),3000,'high')*np.exp(-np.arange(d2)/(0.002*SR))*0.075)[:,None]
    i=int(tf*SR); d=int(0.07*SR); e=rng.standard_normal((d,2))*np.exp(-np.arange(d)/(0.010*SR))[:,None]; x[i:i+d]+=filt(filt(e,600,'high'),8000)*0.11
    return x
def lisse(x): x=np.clip(x,0,1); return x*x*(3-2*x)
def accord(gonfle,tenue=2.0,fin=1.9,pose=0.0,F1=F1,doux=False):
    n=int((gonfle+tenue+fin)*SR); t=np.arange(n)/SR; x=np.clip(t/gonfle,0,1)
    # la hauteur : fixe (ou, « pose » s, un très léger départ de bande : de 96 % à 100 %, sans pleurage ensuite)
    v=np.ones(n) if not pose else 1-0.04*(1-lisse(t/pose))
    ph=2*np.pi*np.cumsum(F1*v)/SR
    fc=140*(2400/140)**lisse(x) if not doux else 85*(2400/85)**(lisse(x)**1.5)   # le filtre s'ouvre : de (très) sombre à lumineux, puis ne bouge plus
    k=n-int(fin*SR); u=np.clip((t-t[k])/fin,0,1); fc=fc*(1-0.6*lisse(u))
    r=np.random.default_rng(3); out=np.zeros((n,2))
    hmax=int(5200/F1)
    A=np.zeros((hmax+1,n))                                      # niveau de chaque harmonique du do 1 au cours du temps
    for nom,m,g,entree,typ in VOIX:
        if doux: entree=min(0.8,entree*1.6)                      # entrée fondue : les voix hautes et la cloche n'arrivent qu'à la toute fin
        e=lisse((x-entree)/(1-entree))*g                        # chaque voix monte sans attaque et ne redescend pas
        for j in ([1] if typ=='sinus' else range(1,hmax//m+1)):
            A[m*j]+=e/j
    for h in range(1,hmax+1):
        if not A[h].any(): continue
        a=A[h]/(1+(h*F1/fc)**2)**1.0                            # (passe-bas doux, sans résonance)
        for c in (0,1): out[:,c]+=a*np.sin(h*ph+r.uniform(0,2*np.pi))   # phases fixes, différentes à gauche et à droite : de la largeur, aucun battement
    env=(0.10+0.90*lisse(x)**1.5 if not doux else lisse(x)**2.0)*np.cos(u*np.pi/2)**2   # (doux : une courbe en S qui part de rien, sans cassure)          # UN seul gonflement, puis la tenue, puis l'extinction
    out*=env[:,None]; out/=np.sqrt((out[int((gonfle+0.3)*SR):int((gonfle+1.5)*SR)]**2).mean()); return out*0.125
def jingle(nom,gonfle,pose=0.0,demi_tons=0,plein=None,g_clac=0.8,niveau=1.0,eclairs=True):
    F=F1*2**(demi_tons/12)                  # l'accord (et le bourdon du néon accordé dessus) transposé
    ins=pc(seg(K,2.30,2.74,0.004,0.035)*2.6,seg(K,3.565,3.86,0.03,0.04)*CLAC,0.03)
    r,tc=rembob(0.75,1.6,1.0,1.45,clac=CLAC*g_clac,queue=0.35); t0=0.03+len(ins)/SR-0.035; tclac=t0+tc/SR
    a=accord(gonfle,pose=pose,F1=F,doux=plein is not None); m=int(0.05*SR); a[:m]*=np.sin(np.linspace(0,np.pi/2,m))[:,None]
    td=tclac-0.02 if plein is None else plein-gonfle; tf=td+gonfle   # (plein donné : l'accord naît plus tôt, sous la fin du rembobinage et sous le clac)
    #   # l'accord émerge dès la queue du clac ; tf : son plein
    n=int(td*SR)+len(a); t=np.arange(n)/SR; cas=np.zeros((n,2)); poser(cas,ins,0.03); poser(cas,r,t0)
    # le bruit de la lecture est déjà là SOUS la fin du rembobinage et sous le clac (il monte à puissance constante dès
    # la touche, pendant tout le rembobinage), tient après le clac — aucun instant où tout retombe — puis se retire sous l'accord :
    # souffle de bande, mécanique (privée de son grave, pour ne pas imposer une hauteur) et un grondement grave sans hauteur
    s=filt(filt(rng.standard_normal(n),250,'high'),5500)*0.0065; s[:int(0.03*SR)]*=np.sin(np.linspace(0,np.pi/2,int(0.03*SR)))
    meca=boucle(filt(filt(seg(R,0.62,2.15,0.01,0.01),380,'high',4),3000)*4.5*3.4,n)
    grond=filt(filt(rng.standard_normal(n),45,'high'),190,'low',4)*0.03
    inst=np.sin(np.clip((t-(t0+0.15))/(tclac-t0-0.15),0,1)**0.6*np.pi/2); retire=1-0.68*lisse((t-max(td,tclac-0.02)-0.15*(tf-max(td,tclac-0.02)))/(0.85*(tf-max(td,tclac-0.02))+0.25))
    bruit=(s*(1+2.0*inst)+(meca+grond)*inst)*retire*np.interp(t,[tf+1.9,tf+3.5],[1,0.15])
    poser(cas,bruit,0); p=filt(cas,9000); poser(p,a,td); p=reverb(p,0.8,0.14)
    p+=neon_sec(tf,n/SR,eclairs)[:n]   # les claquements secs des faux départs et l'étincelle de l'allumage : des bruits, sans hauteur ni coup grave
    # le bourdonnement du néon, accordé sur le do de l'accord : il monte avec les faux départs et reste dessous, sans à-coup
    b=sum(np.sin(2*np.pi*F*h*t+q)/h**e for h,e,q in [(2,0.3,0),(3,0.8,1),(4,0.7,2),(6,0.9,.5),(8,1.0,1.3),(12,1.1,.2)])*(1+0.25*np.sin(2*np.pi*F*t))
    eb=np.where(t<tf,np.clip((t-(tf-2.3))/2.3,0,1)**2.2,np.exp(-np.clip(t-tf,0,None)/2.2))*np.interp(t,[tf+1.9,tf+3.6],[1,0])
    p+=(filt(b,900)*eb*0.016)[:,None]
    print('  ',nom,': clac',round(tclac,2),"s, l'accord émerge à",round(td,2),'s, plein (JINGLE_FRANC) à',round(tf*1000),'ms')
    finir(p*niveau,nom,0.3); return tf   # (niveau : gain d'ensemble ; « finir » arrondit les crêtes en douceur, sans écrêter)
if __name__=='__main__':
    jingle('jingle_mi_doux_A',0.5,demi_tons=4,plein=3.194,g_clac=0.62)      # le jingle retenu : accord en mi, entrée fondue sous le clac
    jingle('jingle_mi_doux_B',0.8,demi_tons=4,plein=3.194,g_clac=0.62,niveau=1.78)   # le jingle validé, remonté de 5 dB (environ -14 LUFS), avec ses claquements de néon
    # LE FICHIER DE L'APPLI : le même sans les claquements des faux départs — l'écran de démarrage les joue lui-même, à l'instant
    # de chaque faux départ (même timbre, même niveau). L'étincelle de l'allumage franc reste dans le fichier.
    jingle('jingle_mi_doux_B_sans_claquements',0.8,demi_tons=4,plein=3.194,g_clac=0.62,niveau=1.78,eclairs=False)
    #
    jingle('jingle_mi_moins1s',0.22,demi_tons=4)
