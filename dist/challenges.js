const { challenges, assess } = ChallengeRules;
let activeChallenge = null;
let attempts = [];
let hintIndex = 0;
let selectedLevel = 1;
let latestAssessment = null;
let solved = [];

try {
  const stored = JSON.parse(localStorage.getItem('cinema-challenges-v1') || '[]');
  if (Array.isArray(stored)) solved = [...new Set(stored.filter(id => challenges.some(challenge => challenge.id === id)))];
} catch { /* Progress is optional when browser storage is unavailable. */ }

function putRequest(request) {
  $('#url').value = request.url;
  $('#method').value = request.method;
  $('#headers').value = JSON.stringify(request.headers, null, 2);
  $('#body').value = request.body;
  $('#redirect').value = request.redirect;
  broken = false;
  $('#break').setAttribute('aria-pressed', 'false');
  $('.editor').open = true;
  $('#sceneDescription').textContent = 'Challenge request. Edit it and inspect the result.';
}

function drawChallenges() {
  $('#progress').textContent = `${solved.length} / ${challenges.length} SOLVED`;
  $('#challengeList').replaceChildren();
  for (const challenge of challenges.filter(item => item.level === selectedLevel)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'challenge-card' + (activeChallenge === challenge ? ' selected' : '');
    button.dataset.challenge = challenge.id;
    button.textContent = (solved.includes(challenge.id) ? '✓ ' : '') + challenge.title;
    button.disabled = busy;
    button.onclick = () => startChallenge(challenge);
    $('#challengeList').append(button);
  }
  document.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.level) === selectedLevel)));
}

function startChallenge(challenge) {
  if (busy) return;
  activeChallenge = challenge;
  attempts = [];
  hintIndex = 0;
  latestAssessment = null;
  putRequest(challenge.setup);
  $('#challengeTask').hidden = false;
  $('#challengeText').textContent = challenge.goal;
  $('#challengeFeedback').textContent = 'Send a request to see where it gets stuck.';
  $('#challengeFeedback').className = '';
  $('#solveNote').textContent = '';
  $('#hintText').textContent = '';
  $('#hint').textContent = 'First hint';
  $('#hint').disabled = false;
  $('#nextRequest').hidden = true;
  drawChallenges();
}

function leaveChallenge() {
  if (busy) return;
  activeChallenge = null;
  attempts = [];
  $('#challengeTask').hidden = true;
  drawChallenges();
}

$('#hint').onclick = () => {
  if (!activeChallenge) return;
  $('#hintText').textContent = activeChallenge.hints[hintIndex];
  hintIndex++;
  $('#hint').textContent = ['First hint', 'Another clue', 'Show the answer', 'All hints shown'][hintIndex];
  $('#hint').disabled = hintIndex >= 3;
};
$('#nextRequest').onclick = () => {
  if (!busy && latestAssessment?.next) putRequest(latestAssessment.next);
};
$('#exitChallenge').onclick = leaveChallenge;
document.querySelectorAll('.scene').forEach(button => button.addEventListener('click', leaveChallenge));
window.addEventListener('cinema:leave-challenge', leaveChallenge);
document.querySelectorAll('[data-level]').forEach(button => button.onclick = () => {
  if (busy) return;
  leaveChallenge();
  selectedLevel = Number(button.dataset.level);
  $('#levelDescription').textContent = ['Addresses, headers, and JSON.', 'Queries, field errors, and saved objects.', 'Redirects, cache versions, and pages.', 'Waiting, recovery, and renewed tokens.'][selectedLevel - 1];
  drawChallenges();
});
window.addEventListener('cinema:reset', () => {
  if (activeChallenge) startChallenge(activeChallenge);
});
window.addEventListener('cinema:response', ({ detail }) => {
  if (!activeChallenge) return;
  attempts.push(detail);
  latestAssessment = assess(activeChallenge.id, attempts);
  $('#nextRequest').hidden = !latestAssessment.next || !latestAssessment.stage || latestAssessment.solved;
  if (latestAssessment.solved) {
    if (!solved.includes(activeChallenge.id)) solved.push(activeChallenge.id);
    try { localStorage.setItem('cinema-challenges-v1', JSON.stringify(solved)); } catch {}
    $('#challengeFeedback').textContent = '✓ Solved.';
    $('#challengeFeedback').className = 'solved';
    $('#solveNote').textContent = activeChallenge.note;
    drawChallenges();
  } else {
    $('#challengeFeedback').textContent = latestAssessment.stage ? `Step ${latestAssessment.stage} complete. Keep going with the same resource.` : `Not there yet (${detail.response.status || 'network error'}). Read the response or try a hint.`;
    $('#challengeFeedback').className = '';
    $('#solveNote').textContent = '';
  }
});
drawChallenges();
