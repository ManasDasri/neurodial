"use strict";
// Educational illustrations are not measured EEG. Model scores come from the published JSON.
const SOURCE="https://github.com/ManasDasri/Med-EEG/blob/main/";
const DATA="https://raw.githubusercontent.com/ManasDasri/Med-EEG/main/results/latest/results.json";
const $=id=>document.getElementById(id), fmt=(x,n=3)=>typeof x==="number"&&Number.isFinite(x)?x.toFixed(n):"—";
const stages=[
["INPUT","Pair recorded EEG with self-reported ratings.","The model learns from the EEG recorded before each report. The participant's rating is the learning target.","EEG electrodes + depth rating 4/5","src/inspect_dataset.py"],
["PREPROCESSING","Reduce interference, then take pre-report segments.","The code filters to 1–45 Hz, repairs bad channels, uses average referencing and ICA to reduce artifacts, then extracts overlapping 2-second epochs and rejects noisy segments.","2 s epochs / 1 s overlap / 150 µV peak-to-peak rejection threshold","src/preprocess.py"],
["FEATURES","Turn EEG activity into numerical measurements.","Welch PSD supplies frequency powers and ratios; phase-amplitude coupling measures a theta–gamma relation; covariance captures how electrode signals vary together.","2 compact biomarkers / 67 spectral features / 2,080 covariance entries","src/extract_features.py"],
["MODELS","Compare representations and learning algorithms.","Ridge learns regularized linear weights. Gradient boosting builds trees. Riemannian ridge transforms 64-channel covariance matrices into tangent-space features and then uses ridge regression.","Ridge vs boosted trees vs tangent-space covariance + ridge","src/depth_decoding.py"],
["VALIDATION","Test on a participant who wasn't in training.","Leave-one-subject-out repeats training and evaluation with each participant excluded in turn. The code also compares no-EEG baselines and disrupted-label null models.","Train on 38 people / test on one / repeat for each of 39","src/model_comparison.py"],
["PUBLISHING","Publish verified research tables, not simulated signals.","Python produces CSV summaries. The publisher collects model results, chance scores, p-values, participant scores, replication and QC in a JSON bundle fetched by the public results dashboard.","Python → CSV → results/latest/results.json → web charts","src/publish_results.py"]
];
function stage(i){const s=stages[i];document.querySelectorAll(".pipeline-step").forEach((b,j)=>{b.classList.toggle("selected",i===j);b.setAttribute("aria-pressed",String(i===j));});$("stage-label").textContent="STAGE 0"+(i+1)+" / "+s[0];$("stage-title").textContent=s[1];$("stage-description").textContent=s[2];$("stage-example").textContent=s[3];$("stage-source").href=SOURCE+s[4];}
document.querySelectorAll(".pipeline-step").forEach(b=>b.addEventListener("click",()=>stage(Number(b.dataset.step))));stage(0);
function ratio(){const g=Number($("gamma-range").value),t=Number($("theta-range").value);$("gamma-value").textContent=g;$("theta-value").textContent=t;$("ratio-result").textContent=fmt(g/t,2);}
["gamma-range","theta-range"].forEach(x=>$(x).addEventListener("input",ratio));ratio();
let thetaPath="",gammaPath="";for(let i=0;i<=340;i+=2){const slow=Math.sin(i*Math.PI/85),amp=5+12*(1+slow)/2;thetaPath+=(i?"L":"M")+i+" "+(62-30*slow).toFixed(2);gammaPath+=(i?"L":"M")+i+" "+(62-amp*Math.sin(i*Math.PI/6)).toFixed(2);}
$("theta-wave").setAttribute("d",thetaPath);$("gamma-wave").setAttribute("d",gammaPath);
for(let i=0;i<8;i++)for(let j=0;j<8;j++){const n=document.createElement("i"),v=i===j?1:0.16+0.72*Math.exp(-Math.abs(i-j)/2.8);n.style.background="rgba(39,107,89,"+v+")";$("matrix-cells").append(n);}
const svgNS="http://www.w3.org/2000/svg";for(let i=0;i<8;i++)for(let j=0;j<8;j++){const x=154+j*28+(i%2)*8,y=112+i*25;if(Math.pow((x-255)/139,2)+Math.pow((y-203)/137,2)>1)continue;const circle=document.createElementNS(svgNS,"circle");circle.setAttribute("cx",x);circle.setAttribute("cy",y);circle.setAttribute("r",3);circle.setAttribute("fill",(i+j)%4===0?"#ba9471":"#2c7164");$("electrode-points").append(circle);}
const people=["A","B","C","D"];function fold(p){document.querySelectorAll(".person-choice").forEach(b=>{b.classList.toggle("active",b.dataset.person===p);b.setAttribute("aria-pressed",String(b.dataset.person===p));});for(const [id,arr] of [["train-people",people.filter(x=>x!==p)],["test-people",[p]]]){$(id).replaceChildren();arr.forEach(x=>{const span=document.createElement("span");span.className="person-chip";span.textContent="Person "+x;$(id).append(span);});}}
document.querySelectorAll(".person-choice").forEach(b=>b.addEventListener("click",()=>fold(b.dataset.person)));fold("A");
const ratings=[5,2,4,1];let k=0;$("shuffle-button").addEventListener("click",()=>{k=(k+1)%ratings.length;$("shuffle-labels").textContent="Rating: "+ratings.map((x,i)=>ratings[(i-k+ratings.length)%ratings.length]).join("   ");});
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
const names={expertise:"Expert vs novice",concentration:"Concentration",mind_wandering:"Mind wandering",depth:"Meditation depth"};
const interpretations={
 expertise:"Sex alone predicts expertise groups better than EEG; classification is confounded.",
 concentration:"EEG does not outperform the time-only baseline.",
 mind_wandering:"Promising AUC, but the Holm-adjusted threshold is not met.",
 depth:"Whole-scalp covariance produces modest depth-ranking evidence; later validation varies across samples."
};
let bundle=null;
function score(task,x){return !x?"—":task==="expertise"?fmt(100*x.score,1)+"%":fmt(x.score);}
function renderModels(task){const host=$("model-bars");host.replaceChildren();const t=bundle&&bundle.tasks&&bundle.tasks[task];if(!t){host.append(node("p","fine","No published data is currently loaded."));return;}
 const rows=t.models.slice().sort((a,b)=>b.score-a.score),max=task==="expertise"?1:.7;
 const ticks=document.createElement("div");ticks.className="axis-ticks";[0,.25,.5,.75,1].forEach(k=>{const mark=document.createElement("span");mark.textContent=task==="expertise"?Math.round(k*100)+"%":(k*max).toFixed(2);ticks.append(mark);});const axis=$("chart-axis");axis.replaceChildren(document.createElement("span"),ticks,document.createElement("span"));
 rows.forEach(m=>{const row=node("div","model-bar-row"+(m.kind==="baseline"?" baseline":"")),track=node("div","track"),bar=node("div","fill");bar.style.width=Math.max(0,Math.min(100,100*m.score/max))+"%";track.append(bar);row.append(node("span","name",m.label),track,node("strong","",score(task,m)));row.title="Shuffled-label chance "+fmt(m.chance)+"; corrected p "+fmt(m.p_corrected);host.append(row);});
 const best=t.models.find(m=>m.model===t.headline.best_model),baseline=t.models.find(m=>m.model===t.headline.best_baseline);
 $("chart-note").textContent=(task==="expertise"?"Participant-level accuracy. ":"Within-person AUC; chance ≈ 0.50. ")+interpretations[task];
 $("model-details").textContent="Best EEG: "+(best?best.label:"—")+" ("+score(task,best)+"). Best non-EEG: "+(baseline?baseline.label:"—")+" ("+score(task,baseline)+"). Best EEG corrected p: "+fmt(best&&best.p_corrected)+".";
}
function addFinding(task,t){const card=node("article","finding-card"),h=t.headline||{},best=t.models.find(x=>x.model===h.best_model),baseline=t.models.find(x=>x.model===h.best_baseline),head=node("div","finding-head");
 head.append(node("h3","",names[task]));const confirmed=h.beats_chance&&h.beats_best_baseline;head.append(node("span","result-state"+(confirmed?"":" caution"),confirmed?"BEATS CHANCE + BASELINE":h.beats_chance?"CHANCE TEST PASSED; BASELINE NOT BEATEN":"NOT CONFIRMED"));card.append(head);
 card.append(node("div","finding-score",score(task,best)),node("p","",interpretations[task]));const meta=node("div","finding-meta");[String(best&&best.n_subjects||"?")+" people","No-EEG "+score(task,baseline),"Holm p "+fmt(best&&best.p_corrected)].forEach(s=>meta.append(node("span","",s)));card.append(meta);$("finding-grid").append(card);
}
$("task-select").addEventListener("change",e=>renderModels(e.target.value));
async function load(){
 try{const response=await fetch(DATA+"?refresh="+Date.now(),{cache:"no-store"});if(!response.ok)throw Error("HTTP "+response.status);const data=await response.json();if(!data.tasks||!data.tasks.depth||!Array.isArray(data.tasks.depth.models))throw Error("Unexpected results schema");bundle=data;
 const r=data.tasks.depth.models.find(x=>x.model==="riemann_ridge");$("fact-subjects").textContent=r.n_subjects;$("fact-reports").textContent=r.n_probes.toLocaleString("en-US");$("fact-auc").textContent=fmt(r.score);
 const d=data.published_at?new Date(data.published_at):null;$("published-status").textContent="Published model data: "+(d&&!isNaN(d.getTime())?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"date unavailable")+". Historical results; latest audited checks may require regeneration.";
 renderModels($("task-select").value);$("finding-grid").replaceChildren();["expertise","concentration","mind_wandering","depth"].forEach(k=>{if(data.tasks[k])addFinding(k,data.tasks[k]);});
 }catch(e){$("published-status").textContent="Unable to load published JSON. The source-linked research explanation remains available.";$("chart-note").textContent="Published scores currently unavailable: "+e.message;$("finding-grid").replaceChildren(node("p","fine","Please use the main results dashboard or retry when the JSON source is reachable."));renderModels($("task-select").value);}
}load();
window.addEventListener("scroll",()=>{const h=document.documentElement.scrollHeight-innerHeight;$("reading-progress").style.width=(h>0?Math.min(100,scrollY/h*100):0)+"%";},{passive:true});
