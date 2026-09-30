/* Sign-in, account and system pages (7). */
const S = 'Sign-in & account';

reg({ id: 'login-staff', group: S, title: 'Sign in — teacher or staff', route: '/login', mode: 'auth', states: ['Empty', 'Errors', 'Signed out', 'Email'],
  render: (st) => authFrame(`<div class="center">${mascot('happy', 110)}<h1>Sign in</h1><p class="muted">Welcome back.</p></div>
    ${card(`<div class="stack">${st === 'Signed out' ? alertBox('<b>You were signed out.</b><br>That happens after a while away. Sign in to pick up where you left off.', '', '👋') : ''}${seg(['I am a student', 'Teacher or staff'], 1)}
      ${field('Email or username *', input('', st === 'Email' ? 'priya@northgate.example' : '', st === 'Errors' ? 'bad' : ''), st === 'Email' ? '' : 'Using a username? Add your school code below.', st === 'Errors' ? 'This is required.' : '')}
      ${st === 'Email' ? '' : field('School code *', input('', ''))}
      ${field('Password *', input('', '', st === 'Errors' ? 'bad' : ''), '', st === 'Errors' ? 'This is required.' : '')}
      ${btn('Sign in', 'block')}</div>`)}
    <p class="center muted">Midas Learning · Ask your teacher if you cannot get in</p>`) });

reg({ id: 'accept', group: S, title: 'Accept your invitation', route: '/accept-invitation', mode: 'auth', states: ['Set password', 'Link incomplete', 'Expired link'],
  render: (st) => authFrame(st === 'Link incomplete'
    ? `<div class="center">${mascot('think', 110)}<h1>This link is incomplete</h1></div>${alertBox('<b>We could not read your invitation.</b> Open the link in your invitation email again, or ask the person who invited you to send a new one.', 'oops', '⚠️')}`
    : `<div class="center">${mascot('cheer', 110)}<h1>Set your password</h1><p class="muted">One step and your account is ready.</p></div>
      ${card(`<div class="stack">${st === 'Expired link' ? alertBox('That invitation has expired. Ask your administrator for a new one.', 'bad', '⏰') : ''}${field('New password *', input('', ''))}<div class="stack" style="gap:6px"><div class="row" style="color:var(--c-good-ink);font-weight:800">✓ At least 10 characters</div><div class="row muted" style="font-weight:800">✗ Not a common password</div><p class="muted" style="font-size:.9em">A few unrelated words are easier to remember and harder to guess than one word with symbols.</p></div>${field('Confirm password *', input(''))}${btn('Create my account', 'block')}</div>`)}`) });

reg({ id: 'change-pw', group: S, title: 'Change password', route: '/change-password', mode: 'auth', states: ['Forced (reset)', 'Voluntary'],
  render: (st) => authFrame(`<div class="center">${mascot('happy', 100)}<h1>${st === 'Voluntary' ? 'Change your password' : 'Choose a new password'}</h1>${st === 'Voluntary' ? '' : '<p class="muted">Your password was reset, so you need a new one before you carry on.</p>'}</div>
    ${card(`<div class="stack">${alertBox('You will be asked to sign in again with the new password.', '', 'ℹ️')}${field('Current password *', input(''))}${field('New password *', input(''))}${field('Confirm new password *', input('', '', 'bad'), '', 'These two do not match.')}${btn('Save new password', 'block locked')}</div>`)}`) });

reg({ id: 'prefs', group: S, title: 'Accessibility & display', route: '/account/preferences', mode: 'learner', states: ['Preferences'],
  render: () => learnerFrame('home', `<div><h1>Accessibility & display</h1><p class="muted">These settings are saved on this device and apply straight away.</p></div>
    ${card(cardHead('Reading') + field('Text size', select(['Normal', 'Large', 'Extra large']), 'Everything grows together, so nothing overlaps.') + `<div class="row" style="margin-top:8px">${sw(true)}<div><b>Dyslexia-friendly text</b><div class="muted" style="font-size:.85em">A wider typeface with more space between letters, words and lines.</div></div></div><div class="card flat tint-sun" style="margin-top:12px">The quick brown fox jumps over the lazy dog. This is how your reading text will look.</div>`, 'tint-blue')}
    ${card(cardHead('Movement and colour') + field('Animations', select(['Match my device setting', 'Reduce movement', 'Allow movement']), 'Celebrations and page transitions. Loading indicators always stay visible.') + `<div class="row" style="margin-top:8px">${sw(false)}<div><b>Stronger contrast</b><div class="muted" style="font-size:.85em">Darker borders and text, and outlines instead of soft shadows.</div></div></div>`, 'tint-grape')}
    <div>${btn('Reset to defaults', 'white')}</div>`) });

reg({ id: 'sessions', group: S, title: 'Signed-in devices', route: '/account/sessions', mode: 'adult', states: ['Devices'],
  render: () => adultFrame('teacher', '', `${pageHead('Signed-in devices', 'If you do not recognise something here, sign it out and change your password.')}${table(['Device', 'Last used', 'Signed in', 'Status'], [['<b>Chrome on Windows</b><div class="muted">86.12.44.9</div>', '2 minutes ago', '30 Sep, 09:02', tag('This device', 'good')], ['<b>Safari on iPad or iPhone</b><div class="muted">86.12.44.31</div>', 'Yesterday', '28 Sep, 08:15', btn('Sign out', 'white sm')], ['<b>Unknown device</b>', '3 weeks ago', '9 Sep, 19:40', btn('Sign out', 'white sm')]], { pager: false, caption: 'Devices currently signed in to your account' })}`) });

reg({ id: 'no-access', group: 'System', title: 'No access', route: '/no-access', mode: 'auth', states: ['No access'],
  render: () => authFrame(`<div class="center stack">${mascot('oops', 150)}<h1>You do not have access to this page</h1><p class="muted">Your account does not include this area. If you think it should, ask your school administrator.</p>${btn('Back to my home page')}</div>`) });

reg({ id: 'not-found', group: 'System', title: 'Page not found', route: '*', mode: 'auth', states: ['404'],
  render: () => authFrame(`<div class="center stack">${mascot('think', 150)}<h1>We could not find that page</h1><p class="muted">The link may be out of date, or the page may have been moved.</p>${btn('Back to my home page')}</div>`) });
