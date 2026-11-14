const $=id=>document.getElementById(id);
let player='', room='', mode='auto', drawn=[], card=[], sound=true;
function sample(arr){return arr[Math.floor(Math.random()*arr.length)]}
function makeCard(){const cols=[[1,15],[16,30],[31,45],[46,60],[61,75]];let out=[];for(let c=0;c<5;c++){let nums=[];while(nums.length<5){let n=Math.floor(Math.random()*(cols[c][1]-cols[c][0]+1))+cols[c][0];if(!nums.includes(n))nums.push(n)}out.push(...nums)}out[12]='LIVRE';return out}
function renderCard(){const root=$('card');root.innerHTML='';card.forEach((n,i)=>{let d=document.createElement('div');d.className='cell'+(n==='LIVRE'?' free':'')+(drawn.includes(n)?' marked':'');d.textContent=n==='LIVRE'?'LIVRE':n;root.appendChild(d)})}
function renderHistory(){$('history').innerHTML='';drawn.forEach(n=>{let d=document.createElement('span');d.className='ball';d.textContent=n;$('history').appendChild(d)});$('drawCount').textContent=`${drawn.length} de 75 sorteadas`;renderCard()}
function beep(){if(!sound)return;try{let ctx=new(window.AudioContext||window.webkitAudioContext)(),o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=660;g.gain.value=.06;o.start();o.stop(ctx.currentTime+.13)}catch(e){}}
function announce(n){drawn.push(n);$('lastBall').textContent=n;renderHistory();beep();if(card.some((v,i)=>v===n)){} }
function drawAuto(){if(drawn.length===75)return alert('Todas as 75 bolinhas já foram sorteadas!');let left=Array.from({length:75},(_,i)=>i+1).filter(n=>!drawn.includes(n));announce(sample(left))}
function start(name,code){player=name.trim();if(!player)return alert('Digite seu nome primeiro.');room=code||'BF'+Math.random().toString(36).slice(2,7).toUpperCase();$('roomCode').textContent=room;$('hello').textContent=`Olá, ${player}!`;$('welcome').classList.add('hidden');$('game').classList.remove('hidden');card=makeCard();drawn=[];$('lastBall').textContent='--';$('connection').textContent='Protótipo local, sem conexão com outros jogadores.';renderHistory()}
$('createRoom').onclick=()=>start($('playerName').value);
$('showJoin').onclick=()=>$('joinArea').classList.toggle('hidden');
$('joinRoom').onclick=()=>{let c=$('roomCodeInput').value.trim().toUpperCase();if(!c)return alert('Digite o código da sala.');start($('playerName').value,c)};
$('autoMode').onclick=()=>setMode('auto');$('manualMode').onclick=()=>setMode('manual');
function setMode(m){mode=m;$('autoMode').classList.toggle('selected',m==='auto');$('manualMode').classList.toggle('selected',m==='manual');$('autoControls').classList.toggle('hidden',m!=='auto');$('manualEntry').classList.toggle('hidden',m!=='manual')}
$('draw').onclick=drawAuto;
$('registerNumber').onclick=()=>{let n=Number($('manualNumber').value);if(!Number.isInteger(n)||n<1||n>75)return alert('Digite um número inteiro de 1 a 75.');if(drawn.includes(n))return alert('Esse número já saiu.');announce(n);$('manualNumber').value=''};
$('soundToggle').onclick=()=>{sound=!sound;$('soundToggle').textContent=sound?'🔊 Som ligado':'🔇 Som desligado'};
$('reset').onclick=()=>{if(confirm('Começar uma nova rodada e apagar o sorteio atual?')){drawn=[];$('lastBall').textContent='--';card=makeCard();renderHistory()}};
$('leave').onclick=()=>{$('game').classList.add('hidden');$('welcome').classList.remove('hidden')};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
