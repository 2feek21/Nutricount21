import { useState, useRef, useCallback, useEffect } from "react";

const SUPA_URL = "https://xwiymstxajvwbhjuisgm.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3aXltc3R4YWp2d2JoanVpc2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDMyMDYsImV4cCI6MjA5MzI3OTIwNn0.IeUF7Uq5_sjcYt7WGxLBZGCLASV0pdfu2MgI5GJDFg4";
const H = { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` };

const GREEN="#1D9E75",ORANGE="#EF9F27",RED="#E24B4A",BLUE="#378ADD",PURPLE="#7F77DD";
const FREE_LIMIT=3;
const DEMO_RESULT={dish:"Bowl poulet grillé · Quinoa · Avocat",items:["poulet grillé","quinoa","avocat","tomates cerises","citron"],calories:520,protein:42,carbs:38,fat:18,confidence:"high",confidence_reason:"Plat clairement visible",portion_note:"Environ 350g — bol normal"};
const SYSTEM_PROMPT=`Tu es un expert en nutrition. Analyse cette photo de repas et retourne UNIQUEMENT un objet JSON valide, sans texte avant ni après, sans backticks markdown.\nFormat exact attendu :\n{"dish":"Nom du plat","items":["aliment 1"],"calories":450,"protein":28,"carbs":52,"fat":14,"confidence":"high","confidence_reason":"Explication courte","portion_note":"Note portion"}\nRègles : calories/protein/carbs/fat sont des entiers. confidence=high|medium|low. Si impossible : {"error":"Raison"}.`;

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
const supa = {
  async signUp(email, password, firstName, lastName, plan) {
    const r = await fetch(`${SUPA_URL}/auth/v1/signup`, { method:"POST", headers:H, body:JSON.stringify({ email, password }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message || d.msg || JSON.stringify(d.error));
    const uid = d.user?.id;
    if (!uid) throw new Error("Inscription impossible — vérifie ta boîte mail pour confirmer ton compte.");
    await fetch(`${SUPA_URL}/rest/v1/profiles`, { method:"POST", headers:{...H,"Prefer":"return=minimal"}, body:JSON.stringify({ id:uid, first_name:firstName, last_name:lastName, plan, scans_today:0, total_scans:0 }) });
    return d;
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, { method:"POST", headers:H, body:JSON.stringify({ email, password }) });
    const d = await r.json();
    if (d.error_description || d.error) throw new Error(d.error_description || d.error);
    return d;
  },
  async getProfile(uid, token) {
    const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}&select=*`, { headers:{...H,"Authorization":`Bearer ${token}`} });
    const d = await r.json();
    return d[0];
  },
  async updateProfile(uid, token, data) {
    await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}`, { method:"PATCH", headers:{...H,"Authorization":`Bearer ${token}`,"Prefer":"return=minimal"}, body:JSON.stringify(data) });
  },
  async insertScan(token, scan) {
    await fetch(`${SUPA_URL}/rest/v1/scans`, { method:"POST", headers:{...H,"Authorization":`Bearer ${token}`,"Prefer":"return=minimal"}, body:JSON.stringify(scan) });
  },
  async getScans(uid, token) {
    const r = await fetch(`${SUPA_URL}/rest/v1/scans?user_id=eq.${uid}&order=scanned_at.desc&limit=50`, { headers:{...H,"Authorization":`Bearer ${token}`} });
    return r.json();
  },
  // Admin (service key needed for cross-user — using anon with RLS off for demo)
  async adminGetAllProfiles() {
    const r = await fetch(`${SUPA_URL}/rest/v1/profiles?select=*&order=created_at.desc`, { headers:H });
    return r.json();
  },
  async adminGetAllScans() {
    const r = await fetch(`${SUPA_URL}/rest/v1/scans?select=*&order=scanned_at.desc&limit=100`, { headers:H });
    return r.json();
  },
  async adminUpdateProfile(uid, data) {
    await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${uid}`, { method:"PATCH", headers:{...H,"Prefer":"return=minimal"}, body:JSON.stringify(data) });
  },
  async adminInsertProfile(data) {
    await fetch(`${SUPA_URL}/rest/v1/profiles`, { method:"POST", headers:{...H,"Prefer":"return=minimal"}, body:JSON.stringify(data) });
  }
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css=`
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.fi{animation:fadeIn .3s ease forwards}
.spin{animation:spin 1s linear infinite}
.pulse{animation:pulse 1.4s ease-in-out infinite}
*{box-sizing:border-box}
input,select{background:var(--color-background-primary,#fff);color:var(--color-text-primary,#1a1a1a);border:1px solid #D0D0D0;border-radius:10px;padding:9px 12px;font-size:14px;width:100%;outline:none}
input:focus,select:focus{border-color:${GREEN};box-shadow:0 0 0 2px ${GREEN}22}
button{cursor:pointer;font-size:14px;border-radius:10px;transition:opacity .15s,transform .1s}
button:active{transform:scale(.97)}
`;

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Btn({onClick,children,style={},disabled=false}){
  return <button onClick={onClick} disabled={disabled} style={{background:GREEN,color:"#fff",border:"none",padding:"11px 0",fontWeight:600,width:"100%",opacity:disabled?.5:1,...style}}>{children}</button>;
}
function BtnOutline({onClick,children,style={}}){
  return <button onClick={onClick} style={{background:"transparent",color:GREEN,border:`1.5px solid ${GREEN}`,padding:"10px 0",fontWeight:600,width:"100%",...style}}>{children}</button>;
}
function Badge({plan}){
  return plan==="premium"
    ?<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#7F77DD22",color:PURPLE,fontWeight:600}}>Premium</span>
    :<span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:"#E8E8E8",color:"#888",fontWeight:600}}>Free</span>;
}
function Avatar({u,size=36}){
  const fn=u?.first_name||u?.firstName||"?", ln=u?.last_name||u?.lastName||"";
  const ini=(fn[0]+(ln[0]||"")).toUpperCase();
  const bg=u?.plan==="premium"?"#7F77DD22":"#E1F5EE", color=u?.plan==="premium"?PURPLE:GREEN;
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:600,fontSize:size*0.33,color,flexShrink:0}}>{ini}</div>;
}
function MacroBar({label,value,total,color}){
  const pct=total>0?Math.min(100,Math.round(value/total*100)):0;
  return <div style={{marginBottom:7}}>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#888",marginBottom:3}}>
      <span>{label}</span><span style={{fontWeight:500,color:"#333"}}>{value}g</span>
    </div>
    <div style={{height:5,borderRadius:99,background:"#F0F0F0",overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,borderRadius:99,background:color,transition:"width .5s"}}/>
    </div>
  </div>;
}
function Spinner(){return <div className="spin" style={{width:28,height:28,border:`3px solid ${GREEN}33`,borderTopColor:GREEN,borderRadius:"50%",margin:"0 auto"}}/>;}
function ErrBox({msg}){return msg?<div style={{background:"#FFF1F1",border:`1px solid ${RED}44`,borderRadius:10,padding:10,fontSize:13,color:RED,marginBottom:10}}>{msg}</div>:null;}
function ProgressRing({pct,color,size=56}){
  const r=22,circ=2*Math.PI*r,off=circ*(1-Math.min(1,pct/100));
  return <svg width={size} height={size} viewBox="0 0 56 56">
    <circle cx="28" cy="28" r={r} fill="none" stroke="#F0F0F0" strokeWidth="5"/>
    <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 28 28)" style={{transition:"stroke-dashoffset .5s"}}/>
    <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{Math.round(pct)}%</text>
  </svg>;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin,onGoRegister}){
  const [email,setEmail]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[loading,setLoading]=useState(false);
  const submit=async()=>{
    if(!email||!pw){setErr("Remplis tous les champs");return;}
    setLoading(true);setErr("");
    try{
      const sess=await supa.signIn(email,pw);
      const profile=await supa.getProfile(sess.user.id,sess.access_token);
      onLogin({...profile,token:sess.access_token,uid:sess.user.id,email:sess.user.email});
    }catch(e){setErr(e.message);}
    setLoading(false);
  };
  return <div style={{padding:"32px 24px",display:"flex",flexDirection:"column",gap:12}}>
    <div style={{textAlign:"center",marginBottom:8}}>
      <div style={{fontSize:32,fontWeight:800,color:GREEN}}>CalorIA</div>
      <div style={{fontSize:13,color:"#aaa",marginTop:2}}>Ton assistant nutrition IA</div>
    </div>
    <ErrBox msg={err}/>
    <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Email</div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ton@email.com"/></div>
    <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Mot de passe</div><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
    <Btn onClick={submit} disabled={loading}>{loading?<Spinner/>:"Se connecter"}</Btn>
    <div style={{textAlign:"center",fontSize:13,color:"#aaa"}}>Pas encore de compte ? <span onClick={onGoRegister} style={{color:GREEN,fontWeight:600,cursor:"pointer"}}>S'inscrire</span></div>
  </div>;
}

function RegisterScreen({onRegister,onGoLogin}){
  const [f,setF]=useState({firstName:"",lastName:"",email:"",password:"",plan:"free"});
  const [err,setErr]=useState(""),[loading,setLoading]=useState(false);
  const set=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const submit=async()=>{
    if(!f.firstName||!f.lastName||!f.email||!f.password){setErr("Tous les champs sont requis");return;}
    if(f.password.length<6){setErr("Mot de passe : 6 caractères minimum");return;}
    setLoading(true);setErr("");
    try{
      await supa.signUp(f.email,f.password,f.firstName,f.lastName,f.plan);
      onRegister(f.email);
    }catch(e){setErr(e.message);}
    setLoading(false);
  };
  return <div style={{padding:"28px 24px",display:"flex",flexDirection:"column",gap:12}}>
    <div style={{textAlign:"center",marginBottom:4}}>
      <div style={{fontSize:22,fontWeight:700}}>Créer un compte</div>
      <div style={{fontSize:12,color:"#aaa"}}>Rejoins CalorIA gratuitement</div>
    </div>
    <ErrBox msg={err}/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Prénom</div><input value={f.firstName} onChange={set("firstName")} placeholder="Marie"/></div>
      <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Nom</div><input value={f.lastName} onChange={set("lastName")} placeholder="Dupont"/></div>
    </div>
    <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Email</div><input type="email" value={f.email} onChange={set("email")} placeholder="marie@email.com"/></div>
    <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Mot de passe</div><input type="password" value={f.password} onChange={set("password")} placeholder="Min. 6 caractères"/></div>
    <div>
      <div style={{fontSize:12,color:"#888",marginBottom:6}}>Formule</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[["free","Gratuit","3 scans/jour"],["premium","Premium","Illimité"]].map(([k,label,sub])=>(
          <div key={k} onClick={()=>setF(p=>({...p,plan:k}))} style={{border:`2px solid ${f.plan===k?(k==="premium"?PURPLE:GREEN):"#E0E0E0"}`,borderRadius:12,padding:"12px 10px",cursor:"pointer",background:f.plan===k?(k==="premium"?"#7F77DD11":"#E1F5EE"):"#fff",textAlign:"center",transition:"all .15s"}}>
            <div style={{fontWeight:600,fontSize:13,color:f.plan===k?(k==="premium"?PURPLE:GREEN):"#333"}}>{label}</div>
            <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
    <Btn onClick={submit} disabled={loading} style={{marginTop:4}}>{loading?<Spinner/>:"Créer mon compte"}</Btn>
    <div style={{textAlign:"center",fontSize:13,color:"#aaa"}}>Déjà inscrit ? <span onClick={onGoLogin} style={{color:GREEN,fontWeight:600,cursor:"pointer"}}>Se connecter</span></div>
  </div>;
}

function ConfirmScreen({email,onGoLogin}){
  return <div style={{padding:"48px 24px",textAlign:"center"}}>
    <div style={{fontSize:48,marginBottom:16}}>📬</div>
    <div style={{fontSize:20,fontWeight:700,marginBottom:8}}>Vérifie tes emails !</div>
    <div style={{fontSize:14,color:"#888",lineHeight:1.6,marginBottom:24}}>Un lien de confirmation a été envoyé à <strong>{email}</strong>.<br/>Clique dessus puis reviens te connecter.</div>
    <Btn onClick={onGoLogin}>Aller à la connexion</Btn>
  </div>;
}

// ─── SCANNER ─────────────────────────────────────────────────────────────────
function ScannerTab({user,onScanComplete,onUpgrade}){
  const [state,setState]=useState("idle");
  const [imgSrc,setImgSrc]=useState(null);
  const [imgBase64,setImgBase64]=useState(null);
  const [imgType,setImgType]=useState("image/jpeg");
  const [result,setResult]=useState(null);
  const [added,setAdded]=useState(false);
  const [err,setErr]=useState(null);
  const fileRef=useRef();

  const today=new Date().toISOString().slice(0,10);
  const scansToday=user.last_scan_date===today?user.scans_today:0;
  const canScan=user.plan==="premium"||scansToday<FREE_LIMIT;
  const scansLeft=user.plan==="free"?Math.max(0,FREE_LIMIT-scansToday):Infinity;

  const handleFile=f=>{if(!f)return;const r=new FileReader();r.onload=e=>{setImgSrc(e.target.result);setImgBase64(e.target.result.split(",")[1]);setImgType(f.type||"image/jpeg");setState("idle");setResult(null);setAdded(false);setErr(null);};r.readAsDataURL(f);};

  const analyze=useCallback(async(demo=false)=>{
    if(!canScan)return;
    if(demo){setState("loading");await new Promise(r=>setTimeout(r,1400));setResult(DEMO_RESULT);setState("result");return;}
    if(!imgBase64)return;
    setState("loading");setErr(null);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:300,system:SYSTEM_PROMPT,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:imgType,data:imgBase64}},{type:"text",text:"Analyse ce repas."}]}]})});
      const data=await res.json();
      const text=data.content?.map(b=>b.text||"").join("").trim();
      const parsed=JSON.parse(text);
      if(parsed.error){setErr(parsed.error);setState("error");}
      else{setResult(parsed);setState("result");}
    }catch(e){setErr("Impossible d'analyser l'image. Essaie le mode démo.");setState("error");}
  },[imgBase64,imgType,canScan]);

  const addToJournal=async()=>{
    if(!result||added)return;
    try{
      await supa.insertScan(user.token,{user_id:user.uid,dish:result.dish,calories:result.calories,protein:result.protein,carbs:result.carbs,fat:result.fat,confidence:result.confidence});
      const newToday=scansToday+1;
      await supa.updateProfile(user.uid,user.token,{scans_today:newToday,total_scans:(user.total_scans||0)+1,last_scan_date:today});
      onScanComplete({scans_today:newToday,total_scans:(user.total_scans||0)+1,last_scan_date:today});
      setAdded(true);
    }catch(e){setErr("Erreur lors de l'enregistrement.");}
  };

  return <div style={{padding:"16px 16px 20px"}}>
    {user.plan==="free"&&(
      <div style={{background:canScan?"#FFF8EE":"#FFF1F1",border:`1px solid ${canScan?ORANGE:RED}33`,borderRadius:12,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:canScan?ORANGE:RED}}>{canScan?`${scansLeft} scan${scansLeft>1?"s":""} restant${scansLeft>1?"s":""}` : "Limite atteinte"}</div>
          <div style={{fontSize:11,color:"#aaa"}}>Gratuit · 3 scans/jour</div>
        </div>
        <span onClick={onUpgrade} style={{fontSize:11,padding:"5px 10px",background:PURPLE,color:"#fff",borderRadius:20,cursor:"pointer",fontWeight:600}}>Premium</span>
      </div>
    )}
    {user.plan==="premium"&&<div style={{background:"#7F77DD11",border:`1px solid ${PURPLE}33`,borderRadius:12,padding:"8px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:14}}>✦</span><span style={{fontSize:12,color:PURPLE,fontWeight:600}}>Scans illimités · Premium</span></div>}

    <div onClick={()=>canScan&&state!=="loading"&&fileRef.current.click()} style={{border:imgSrc?"none":`2px dashed ${GREEN}44`,borderRadius:16,overflow:"hidden",minHeight:imgSrc?200:140,display:"flex",alignItems:"center",justifyContent:"center",cursor:canScan&&state!=="loading"?"pointer":"default",background:imgSrc?"transparent":"#F8FFFE",marginBottom:14,opacity:canScan?1:.6}}>
      {imgSrc?<img src={imgSrc} alt="repas" style={{width:"100%",borderRadius:14,maxHeight:240,objectFit:"cover"}}/>:
      <div style={{textAlign:"center",padding:20}}>
        <div style={{fontSize:30,marginBottom:6}}>📸</div>
        <div style={{fontSize:13,color:canScan?GREEN:"#aaa",fontWeight:500}}>{canScan?"Prends une photo de ton repas":"Limite journalière atteinte"}</div>
      </div>}
    </div>
    <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>

    {state!=="loading"&&<div style={{display:"flex",gap:8,marginBottom:14}}>
      {imgBase64&&canScan&&<Btn onClick={()=>analyze(false)}>Analyser</Btn>}
      <BtnOutline onClick={()=>{setImgSrc(null);setImgBase64(null);analyze(true);}} style={imgBase64?{flex:"0 0 auto",width:"auto",padding:"10px 16px"}:{}}>Démo</BtnOutline>
    </div>}
    {state==="loading"&&<div className="pulse" style={{textAlign:"center",padding:20}}>
      <Spinner/><div style={{color:GREEN,fontWeight:600,fontSize:13,marginTop:10}}>L'IA analyse ton assiette...</div>
    </div>}
    {state==="error"&&<ErrBox msg={err}/>}
    {state==="result"&&result&&<div className="fi" style={{background:"#fff",borderRadius:16,border:"1px solid #E8E8E8",padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div style={{flex:1,paddingRight:8}}>
          <div style={{fontWeight:700,fontSize:14,lineHeight:1.3,marginBottom:3}}>{result.dish}</div>
          <div style={{fontSize:11,color:"#aaa"}}>{(result.items||[]).join(" · ")}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:28,fontWeight:800,color:GREEN,lineHeight:1}}>{result.calories}</div>
          <div style={{fontSize:10,color:"#aaa"}}>kcal</div>
        </div>
      </div>
      <MacroBar label="Protéines" value={result.protein} total={result.protein+result.carbs+result.fat} color={GREEN}/>
      <MacroBar label="Glucides" value={result.carbs} total={result.protein+result.carbs+result.fat} color={ORANGE}/>
      <MacroBar label="Lipides" value={result.fat} total={result.protein+result.carbs+result.fat} color={BLUE}/>
      {result.portion_note&&<div style={{fontSize:11,color:"#aaa",marginTop:8,marginBottom:10,fontStyle:"italic"}}>{result.portion_note}</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
        <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:`${result.confidence==="high"?GREEN:result.confidence==="medium"?ORANGE:RED}22`,color:result.confidence==="high"?GREEN:result.confidence==="medium"?ORANGE:RED,fontWeight:500}}>
          {result.confidence==="high"?"±10%":result.confidence==="medium"?"±20%":"±30%"}
        </span>
        {!added
          ?<button onClick={addToJournal} style={{padding:"7px 14px",borderRadius:20,border:"none",background:GREEN,color:"#fff",fontWeight:600,fontSize:12}}>+ Enregistrer</button>
          :<span style={{fontSize:12,color:GREEN,fontWeight:600}}>✓ Enregistré</span>}
      </div>
    </div>}
  </div>;
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────────
function JournalTab({user}){
  const [scans,setScans]=useState([]);
  const [loading,setLoading]=useState(true);
  const goal=1800;

  useEffect(()=>{
    supa.getScans(user.uid,user.token).then(d=>{ setScans(Array.isArray(d)?d:[]); setLoading(false); }).catch(()=>setLoading(false));
  },[user.uid]);

  const today=new Date().toISOString().slice(0,10);
  const todayScans=scans.filter(s=>s.scanned_at?.slice(0,10)===today);
  const total=todayScans.reduce((s,e)=>s+e.calories,0);
  const pct=Math.min(100,Math.round(total/goal*100));
  const barColor=pct>100?RED:pct>80?ORANGE:GREEN;
  const totalP=todayScans.reduce((s,e)=>s+(e.protein||0),0);
  const totalC=todayScans.reduce((s,e)=>s+(e.carbs||0),0);
  const totalF=todayScans.reduce((s,e)=>s+(e.fat||0),0);

  if(loading)return <div style={{padding:40,textAlign:"center"}}><Spinner/></div>;

  return <div style={{padding:"16px 16px 20px"}}>
    <div style={{background:"#F8FFFE",borderRadius:16,padding:16,marginBottom:14,border:`1px solid ${GREEN}22`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
        <span style={{fontWeight:800,fontSize:24,color:barColor}}>{total}</span>
        <span style={{fontSize:13,color:"#aaa"}}>/ {goal} kcal</span>
      </div>
      <div style={{height:8,borderRadius:99,background:"#E8E8E8",overflow:"hidden",marginBottom:6}}>
        <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:99,transition:"width .5s"}}/>
      </div>
      <div style={{fontSize:11,color:"#aaa"}}>{pct>=100?"Objectif atteint 🎯":`${goal-total} kcal restantes · ${pct}%`}</div>
    </div>

    {todayScans.length>0&&<div style={{background:"#fff",borderRadius:14,border:"1px solid #E8E8E8",padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Macros du jour</div>
      <MacroBar label="Protéines" value={totalP} total={totalP+totalC+totalF} color={GREEN}/>
      <MacroBar label="Glucides" value={totalC} total={totalP+totalC+totalF} color={ORANGE}/>
      <MacroBar label="Lipides" value={totalF} total={totalP+totalC+totalF} color={BLUE}/>
    </div>}

    {todayScans.length===0
      ?<div style={{textAlign:"center",padding:40,color:"#ccc"}}>
        <div style={{fontSize:32,marginBottom:8}}>🍽️</div>
        <div style={{fontSize:14}}>Aucun repas scanné aujourd'hui</div>
      </div>
      :<div>
        <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Repas du jour</div>
        {todayScans.map((e,i)=>(
          <div key={i} className="fi" style={{background:"#fff",borderRadius:12,border:"1px solid #E8E8E8",padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:20}}>🥗</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:500,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.dish}</div>
              <div style={{fontSize:11,color:"#aaa"}}>{new Date(e.scanned_at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:700,fontSize:15,color:GREEN}}>{e.calories}</div>
              <div style={{fontSize:10,color:"#aaa"}}>kcal</div>
            </div>
          </div>
        ))}
      </div>}
  </div>;
}

// ─── PROFIL ───────────────────────────────────────────────────────────────────
function ProfileTab({user,onLogout,onUpgrade,onProfileUpdate}){
  const [w,setW]=useState(""),h2=useState("")[0],setH=useState("")[1];
  const [weight,setWeight]=useState(""),[height,setHeight]=useState(""),[age,setAge]=useState(""),[act,setAct]=useState("moderate");
  const mult={sedentary:1.2,light:1.375,moderate:1.55,active:1.725};
  const bmr=weight&&height&&age?Math.round(10*weight+6.25*height-5*age+5):null;
  const tdee=bmr?Math.round(bmr*(mult[act]||1.2)):null;
  const today=new Date().toISOString().slice(0,10);
  const scansToday=user.last_scan_date===today?user.scans_today:0;

  const upgradePlan=async()=>{
    await supa.updateProfile(user.uid,user.token,{plan:"premium"});
    onProfileUpdate({plan:"premium"});
  };

  return <div style={{padding:"16px 16px 20px"}}>
    <div style={{background:"#fff",borderRadius:16,border:"1px solid #E8E8E8",padding:16,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <Avatar u={user} size={48}/>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>{user.first_name} {user.last_name}</div>
          <div style={{fontSize:12,color:"#aaa"}}>{user.email}</div>
          <div style={{marginTop:4}}><Badge plan={user.plan}/></div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,borderTop:"1px solid #F0F0F0",paddingTop:12}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:GREEN}}>{user.total_scans||0}</div>
          <div style={{fontSize:11,color:"#aaa"}}>scans total</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:20,fontWeight:800,color:user.plan==="free"?ORANGE:PURPLE}}>{user.plan==="free"?`${scansToday}/${FREE_LIMIT}`:"∞"}</div>
          <div style={{fontSize:11,color:"#aaa"}}>{user.plan==="free"?"scans aujourd'hui":"illimités"}</div>
        </div>
      </div>
    </div>

    {user.plan==="free"&&<div style={{background:"#7F77DD11",border:`1px solid ${PURPLE}33`,borderRadius:14,padding:14,marginBottom:14}}>
      <div style={{fontWeight:700,fontSize:14,color:PURPLE,marginBottom:4}}>✦ Passer Premium</div>
      <div style={{fontSize:12,color:"#555",marginBottom:10}}>Scans illimités, historique complet</div>
      <Btn onClick={upgradePlan} style={{background:PURPLE,border:"none"}}>Activer Premium</Btn>
    </div>}

    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E8E8E8",padding:14,marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>Calcul TDEE</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Poids (kg)</div><input type="number" value={weight} onChange={e=>setWeight(Number(e.target.value))}/></div>
        <div><div style={{fontSize:12,color:"#888",marginBottom:4}}>Taille (cm)</div><input type="number" value={height} onChange={e=>setHeight(Number(e.target.value))}/></div>
      </div>
      <div style={{marginBottom:10}}><div style={{fontSize:12,color:"#888",marginBottom:4}}>Âge</div><input type="number" value={age} onChange={e=>setAge(Number(e.target.value))}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[["sedentary","Sédentaire"],["light","Léger"],["moderate","Modéré"],["active","Actif"]].map(([k,v])=>(
          <button key={k} onClick={()=>setAct(k)} style={{padding:"8px 0",borderRadius:10,fontSize:12,fontWeight:act===k?700:400,border:`1.5px solid ${act===k?GREEN:"#E8E8E8"}`,background:act===k?GREEN+"15":"#fff",color:act===k?GREEN:"#555"}}>{v}</button>
        ))}
      </div>
      {tdee&&<div className="fi" style={{marginTop:14,background:`${GREEN}10`,borderRadius:12,padding:12,display:"flex",justifyContent:"space-around"}}>
        {[["BMR",bmr,"kcal",GREEN],["TDEE",tdee,"kcal/j",GREEN]].map(([l,v,u,c])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:"#888",marginBottom:2}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:10,color:"#aaa"}}>{u}</div>
          </div>
        ))}
      </div>}
    </div>

    <button onClick={onLogout} style={{width:"100%",padding:"11px 0",borderRadius:10,border:`1px solid ${RED}44`,background:"transparent",color:RED,fontWeight:600,fontSize:14}}>Se déconnecter</button>
  </div>;
}

// ─── BACKOFFICE ───────────────────────────────────────────────────────────────
function Backoffice({onClose}){
  const [boTab,setBoTab]=useState("dashboard");
  const [users,setUsers]=useState([]);
  const [scans,setScans]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [err,setErr]=useState("");

  const load=async()=>{
    setLoading(true);
    try{
      const [u,s]=await Promise.all([supa.adminGetAllProfiles(),supa.adminGetAllScans()]);
      setUsers(Array.isArray(u)?u:[]);
      setScans(Array.isArray(s)?s:[]);
    }catch(e){setErr("Erreur de chargement — vérifie les politiques RLS Supabase");}
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const togglePlan=async(uid,cur)=>{
    const np=cur==="premium"?"free":"premium";
    await supa.adminUpdateProfile(uid,{plan:np});
    setUsers(p=>p.map(u=>u.id===uid?{...u,plan:np}:u));
  };

  const total=users.length,premium=users.filter(u=>u.plan==="premium").length,free=users.filter(u=>u.plan==="free").length;
  const totalScans=users.reduce((s,u)=>s+(u.total_scans||0),0);
  const convRate=total>0?Math.round(premium/total*100):0;
  const filtered=users.filter(u=>`${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()));

  const StatCard=({label,value,sub,color=GREEN})=>(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #2A2A4A",padding:14,textAlign:"center"}}>
      <div style={{fontSize:24,fontWeight:800,color}}>{value}</div>
      <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:"#666",marginTop:1}}>{sub}</div>}
    </div>
  );

  return <div style={{background:"#12122A",minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <div style={{background:"#1A1A3E",padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid #2A2A5A"}}>
      <div>
        <div style={{color:"#fff",fontWeight:700,fontSize:16}}>Backoffice CalorIA</div>
        <div style={{color:"#7070A0",fontSize:11}}>Base Supabase live</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={load} style={{color:"#7070A0",background:"transparent",border:"1px solid #3A3A6A",borderRadius:8,padding:"5px 10px",fontSize:12}}>↻ Refresh</button>
        <button onClick={onClose} style={{color:"#aaa",background:"transparent",border:"1px solid #3A3A6A",borderRadius:8,padding:"5px 10px",fontSize:12}}>← App</button>
      </div>
    </div>

    <div style={{display:"flex",background:"#1A1A3E",borderBottom:"1px solid #2A2A5A"}}>
      {[["dashboard","📊 Stats"],["users","👥 Users"],["scans","📷 Scans"]].map(([k,v])=>(
        <button key={k} onClick={()=>setBoTab(k)} style={{flex:1,padding:"11px 0",fontSize:12,fontWeight:boTab===k?700:400,color:boTab===k?"#fff":"#7070A0",border:"none",background:"transparent",borderBottom:boTab===k?`2.5px solid ${GREEN}`:"2.5px solid transparent"}}>{v}</button>
      ))}
    </div>

    <div style={{padding:14}}>
      {loading&&<div style={{padding:40,textAlign:"center"}}><Spinner/><div style={{color:"#aaa",fontSize:13,marginTop:10}}>Chargement Supabase...</div></div>}
      {err&&<div style={{background:"#2A1A1A",border:`1px solid ${RED}44`,borderRadius:10,padding:12,color:RED,fontSize:13,marginBottom:14}}>{err}<div style={{fontSize:11,color:"#888",marginTop:4}}>Conseil : dans Supabase → Authentication → Policies, ajoute une policy SELECT sans filtre pour le backoffice, ou utilise la Service Key.</div></div>}

      {!loading&&boTab==="dashboard"&&<div className="fi">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <StatCard label="Utilisateurs" value={total} sub={`${premium} premium`}/>
          <StatCard label="Taux conv." value={`${convRate}%`} sub="free → premium" color={PURPLE}/>
          <StatCard label="Scans total" value={totalScans}/>
          <StatCard label="Free" value={free} sub="utilisateurs" color={ORANGE}/>
        </div>
        <div style={{background:"#1A1A3E",borderRadius:14,border:"1px solid #2A2A5A",padding:14,marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7070A0",marginBottom:14,textTransform:"uppercase",letterSpacing:.5}}>Répartition plans</div>
          <div style={{display:"flex",justifyContent:"space-around",alignItems:"center"}}>
            <ProgressRing pct={convRate} color={PURPLE}/>
            <div>
              {[[PURPLE,`${premium} Premium`],["#888",`${free} Free`]].map(([c,l])=>(
                <div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:10,height:10,borderRadius:2,background:c}}/>
                  <span style={{fontSize:12,color:"#bbb"}}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{background:"#1A1A3E",borderRadius:14,border:"1px solid #2A2A5A",padding:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7070A0",marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>Derniers utilisateurs</div>
          {users.slice(0,5).map(u=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #2A2A4A"}}>
              <Avatar u={u} size={30}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.first_name} {u.last_name}</div>
                <div style={{fontSize:11,color:"#666"}}>{u.created_at?.slice(0,10)}</div>
              </div>
              <Badge plan={u.plan}/>
            </div>
          ))}
        </div>
      </div>}

      {!loading&&boTab==="users"&&<div className="fi">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un utilisateur..." style={{marginBottom:12,background:"#1A1A3E",border:"1px solid #2A2A5A",color:"#ddd"}}/>
        {filtered.map(u=>(
          <div key={u.id} style={{background:"#1A1A3E",borderRadius:12,border:"1px solid #2A2A5A",padding:12,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <Avatar u={u} size={34}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.first_name} {u.last_name}</div>
              </div>
              <Badge plan={u.plan}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#666",marginBottom:10}}>
              <span>{u.total_scans||0} scans total</span>
              <span>Depuis {u.created_at?.slice(0,10)}</span>
            </div>
            <button onClick={()=>togglePlan(u.id,u.plan)} style={{width:"100%",padding:"7px 0",borderRadius:8,border:`1px solid ${u.plan==="premium"?PURPLE:GREEN}`,background:"transparent",color:u.plan==="premium"?PURPLE:GREEN,fontSize:11,fontWeight:600}}>
              {u.plan==="premium"?"↓ Passer en Free":"↑ Passer Premium"}
            </button>
          </div>
        ))}
        {filtered.length===0&&<div style={{textAlign:"center",color:"#666",padding:30,fontSize:13}}>Aucun utilisateur trouvé</div>}
      </div>}

      {!loading&&boTab==="scans"&&<div className="fi">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <StatCard label="Total scans" value={scans.length}/>
          <StatCard label="Moy. calories" value={scans.length?Math.round(scans.reduce((s,e)=>s+(e.calories||0),0)/scans.length):0} sub="par repas" color={ORANGE}/>
        </div>
        {scans.slice(0,20).map(s=>{
          const u=users.find(u=>u.id===s.user_id);
          return <div key={s.id} style={{background:"#1A1A3E",borderRadius:12,border:"1px solid #2A2A5A",padding:"10px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:18}}>🍽️</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:"#ddd",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.dish}</div>
              <div style={{fontSize:11,color:"#666"}}>{u?`${u.first_name} ${u.last_name}`:"Utilisateur"} · {s.scanned_at?.slice(0,10)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:14,fontWeight:700,color:GREEN}}>{s.calories}</div>
              <div style={{fontSize:10,color:"#666"}}>kcal</div>
            </div>
          </div>;
        })}
        {scans.length===0&&<div style={{textAlign:"center",color:"#666",padding:30,fontSize:13}}>Aucun scan enregistré</div>}
      </div>}
    </div>
  </div>;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App(){
  const [screen,setScreen]=useState("login");
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("scanner");
  const [showBO,setShowBO]=useState(false);
  const [showUpgrade,setShowUpgrade]=useState(false);
  const [confirmEmail,setConfirmEmail]=useState("");

  const login=u=>{ setUser(u); setScreen("app"); };
  const register=email=>{ setConfirmEmail(email); setScreen("confirm"); };
  const logout=()=>{ setUser(null); setScreen("login"); setTab("scanner"); };
  const onScanComplete=updates=>setUser(p=>({...p,...updates}));
  const onProfileUpdate=updates=>setUser(p=>({...p,...updates}));
  const upgradePremium=async()=>{ await supa.updateProfile(user.uid,user.token,{plan:"premium"}); setUser(p=>({...p,plan:"premium"})); setShowUpgrade(false); };

  if(showBO) return <Backoffice onClose={()=>setShowBO(false)}/>;

  if(screen==="login") return <div style={{maxWidth:390,margin:"0 auto",fontFamily:"system-ui,-apple-system,sans-serif"}}><style>{css}</style><div style={{padding:"32px 0 16px",textAlign:"center"}}><div style={{display:"inline-block",width:56,height:56,background:`${GREEN}15`,borderRadius:18,lineHeight:"56px",fontSize:28,marginBottom:4}}>🥗</div></div><LoginScreen onLogin={login} onGoRegister={()=>setScreen("register")}/></div>;
  if(screen==="register") return <div style={{maxWidth:390,margin:"0 auto",fontFamily:"system-ui,-apple-system,sans-serif"}}><style>{css}</style><RegisterScreen onRegister={register} onGoLogin={()=>setScreen("login")}/></div>;
  if(screen==="confirm") return <div style={{maxWidth:390,margin:"0 auto",fontFamily:"system-ui,-apple-system,sans-serif"}}><style>{css}</style><ConfirmScreen email={confirmEmail} onGoLogin={()=>setScreen("login")}/></div>;

  const tabs=[{id:"scanner",icon:"📷",label:"Scanner"},{id:"journal",icon:"📋",label:"Journal"},{id:"profil",icon:"👤",label:"Profil"}];

  return <div style={{maxWidth:390,margin:"0 auto",minHeight:"100vh",display:"flex",flexDirection:"column",background:"#FAFAFA",fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <style>{css}</style>

    {showUpgrade&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"flex-end",zIndex:50,maxWidth:390,margin:"0 auto"}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",padding:24,width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:36,marginBottom:8}}>✦</div>
          <div style={{fontSize:20,fontWeight:800,color:PURPLE}}>Passer Premium</div>
          <div style={{fontSize:13,color:"#aaa",marginTop:4}}>Scans illimités, sans restriction</div>
        </div>
        {["Scans IA illimités","Historique complet","Accès prioritaire aux nouvelles fonctionnalités"].map(f=>(
          <div key={f} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13}}><span style={{color:PURPLE,fontWeight:700}}>✓</span><span>{f}</span></div>
        ))}
        <div style={{height:12}}/>
        <Btn onClick={upgradePremium} style={{background:PURPLE,border:"none",marginBottom:8}}>Activer Premium — 9,99€/mois</Btn>
        <button onClick={()=>setShowUpgrade(false)} style={{width:"100%",padding:"10px 0",border:"none",background:"transparent",color:"#aaa",fontSize:13}}>Pas maintenant</button>
      </div>
    </div>}

    <div style={{padding:"13px 16px 0",background:"#fff",borderBottom:"1px solid #F0F0F0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>CalorIA</div>
          <div style={{fontSize:11,color:"#aaa"}}>Bonjour {user?.first_name} 👋</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Badge plan={user?.plan}/>
          <button onClick={()=>setShowBO(true)} style={{fontSize:11,padding:"5px 10px",background:"#1A1A2E",color:"#fff",border:"none",borderRadius:8,fontWeight:600}}>Admin</button>
        </div>
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",paddingBottom:70}}>
      {tab==="scanner"&&<ScannerTab user={user} onScanComplete={onScanComplete} onUpgrade={()=>setShowUpgrade(true)}/>}
      {tab==="journal"&&<JournalTab user={user}/>}
      {tab==="profil"&&<ProfileTab user={user} onLogout={logout} onUpgrade={()=>setShowUpgrade(true)} onProfileUpdate={onProfileUpdate}/>}
    </div>

    <div style={{position:"sticky",bottom:0,background:"#fff",borderTop:"1px solid #F0F0F0",display:"flex",padding:"8px 0 10px",zIndex:10}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 0"}}>
          <span style={{fontSize:18}}>{t.icon}</span>
          <span style={{fontSize:10,fontWeight:tab===t.id?700:400,color:tab===t.id?GREEN:"#BBB"}}>{t.label}</span>
          {tab===t.id&&<div style={{width:18,height:2,borderRadius:99,background:GREEN}}/>}
        </button>
      ))}
    </div>
  </div>;
}
