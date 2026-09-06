const form = document.querySelector('#guestbook-form');
const messages = document.querySelector('.guestbook-messages');
const ownerButton = document.querySelector('#owner-mode');
const ownerState = document.querySelector('#owner-state');
const storageKey = 'jason-portfolio-guestbook';
const ownerKey = 'jason-portfolio-owner-token';
let remoteAvailable = false;

const formatDate = () => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
const token = () => sessionStorage.getItem(ownerKey);
function localEntries() { try { return JSON.parse(localStorage.getItem(storageKey)) || []; } catch { return []; } }
function ownerUI() { const on = Boolean(token()); ownerState.textContent = on ? 'Reply mode enabled — posting as Jason' : 'Guest view — messages only'; ownerButton.textContent = on ? 'Disable reply mode' : 'Jason? Enable reply mode'; }

async function entries() {
  try { const response = await fetch('/api/messages'); if (!response.ok) throw new Error(); remoteAvailable = true; return response.json(); }
  catch { remoteAvailable = false; return localEntries(); }
}

async function render() {
  const list = await entries();
  messages.replaceChildren();
  if (!list.length) { const empty = document.createElement('p'); empty.className = 'empty-message'; empty.textContent = 'Be the first to leave a message.'; messages.append(empty); return; }
  list.slice(0, 20).forEach((entry, index) => {
    const article = document.createElement('article'); article.className = 'guest-entry';
    const name = document.createElement('h3'); name.textContent = entry.name;
    const date = document.createElement('time'); date.textContent = entry.created_at || entry.date;
    const body = document.createElement('p'); body.textContent = entry.message;
    const replies = document.createElement('div'); replies.className = 'replies';
    (entry.replies || []).forEach((reply) => { const item = document.createElement('article'); const replyName = document.createElement('h4'); const replyDate = document.createElement('time'); const replyBody = document.createElement('p'); replyName.textContent = 'Jason'; replyDate.textContent = reply.created_at || reply.date; replyBody.textContent = reply.message; item.append(replyName, replyDate, replyBody); replies.append(item); });
    article.append(name, date, body, replies);
    if (token()) { const button = document.createElement('button'); button.className = 'reply-toggle'; button.type = 'button'; button.textContent = 'Reply as Jason ↗'; button.addEventListener('click', () => replyForm(article, entry.id ?? index)); article.append(button); }
    messages.append(article);
  });
}

function replyForm(entryElement, id) {
  const existing = entryElement.querySelector('.reply-form'); if (existing) { existing.remove(); return; }
  const reply = document.createElement('form'); reply.className = 'reply-form';
  const textarea = document.createElement('textarea'); textarea.maxLength = 280; textarea.placeholder = 'Write your reply as Jason…'; textarea.required = true;
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Post reply ↗'; reply.append(textarea, submit);
  reply.addEventListener('submit', async (event) => { event.preventDefault(); const message = textarea.value.trim(); if (!message) return;
    if (remoteAvailable) { const response = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Owner-Token': token() }, body: JSON.stringify({ type: 'reply', messageId: id, message }) }); if (!response.ok) { alert('Reply could not be posted. Check owner reply mode.'); return; } }
    else { const list = localEntries(); list[id].replies = list[id].replies || []; list[id].replies.push({ message, date: formatDate() }); localStorage.setItem(storageKey, JSON.stringify(list)); }
    render();
  });
  entryElement.append(reply); textarea.focus();
}

ownerButton.addEventListener('click', () => {
  if (token()) sessionStorage.removeItem(ownerKey);
  else if (location.protocol === 'file:') sessionStorage.setItem(ownerKey, 'local-preview-owner');
  else { const value = window.prompt('Enter your private owner reply token:'); if (value) sessionStorage.setItem(ownerKey, value.trim()); }
  ownerUI(); render();
});
form.addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(form); const name = data.get('name').trim(); const message = data.get('message').trim(); if (!name || !message) return;
  if (remoteAvailable) { const response = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'message', name, message }) }); if (!response.ok) { alert('Message could not be posted. Please try again.'); return; } }
  else { const list = localEntries(); list.unshift({ name, message, date: formatDate(), replies: [] }); localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 20))); }
  form.reset(); render();
});
ownerUI(); render();
