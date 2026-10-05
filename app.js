'use strict';
const screenNames = ['home', 'question', 'bests'];
const labels = {home: 'Home', question: 'Learn', bests: 'My personal bests'};
const notice = document.getElementById('notice');
const messages = {
  voice: ['A voice is on its way', 'Soon, your computer voice will read this with you. For now, ask Mum to read it with you.'],
  parent: ['Parent area preview', 'Parent sign-in and a dashboard PIN are planned for later. There is no account or saved information in this design preview.'],
  me: ['A sidekick of your own', 'Soon, you can pick your reptile and give it a name. This little gecko is helping us try the screens.'],
  answer: ['A little practice peek', 'This page is here to try the design. It does not mark answers or save scores yet. Try the hint with Mum.'],
  empty: ['Pop a number in', 'You can type a number in the answer box. There is no rush.']
};
function openNotice(kind) {
  const [title, copy] = messages[kind];
  document.getElementById('voice-status').hidden = true;
  document.getElementById('notice-title').textContent = title;
  document.getElementById('notice-copy').textContent = copy;
  notice.showModal();
}
function renderScreen(focus = false) {
  const requested = location.hash.slice(1);
  const current = screenNames.includes(requested) ? requested : 'home';
  for (const name of screenNames) document.getElementById(name).hidden = name !== current;
  document.querySelectorAll('[data-screen]').forEach(link => {
    if (link.dataset.screen === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `Summer’s Learning Lab · ${labels[current]}`;
  window.scrollTo({top: 0, behavior: 'instant'});
  if (focus) document.getElementById(`${current === 'question' ? 'question' : current === 'bests' ? 'bests' : 'home'}-title`).focus({preventScroll: true});
}
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => {
  const next = button.dataset.go;
  if (location.hash === `#${next}`) renderScreen(true);
  else location.hash = next;
}));
window.addEventListener('hashchange', () => renderScreen(true));
document.querySelectorAll('[data-notice]').forEach(button => button.addEventListener('click', () => openNotice(button.dataset.notice)));
document.querySelectorAll('[data-read]').forEach(button => button.addEventListener('click', () => {
  if (notice.open) {
    const status = document.getElementById('voice-status');
    status.textContent = 'Sound is coming soon. Mum can read this with you.';
    status.hidden = false;
  } else openNotice('voice');
}));
for (const id of ['close-notice', 'dismiss-notice']) document.getElementById(id).addEventListener('click', () => notice.close());
document.getElementById('hint-button').addEventListener('click', event => {
  const hint = document.getElementById('hint');
  hint.hidden = !hint.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!hint.hidden));
  if (!hint.hidden) hint.scrollIntoView({block: 'center', behavior: 'instant'});
});
document.getElementById('sample-answer-form').addEventListener('submit', event => {
  event.preventDefault();
  openNotice(document.getElementById('answer').value.trim() ? 'answer' : 'empty');
});
renderScreen();
