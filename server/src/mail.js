// Password reset codes by email, through Resend (resend.com). Off until RESEND_API_KEY and MAIL_FROM are set as Fly secrets.
// (MAIL_DEV_LOG=1, for the tests only: the code is printed instead of sent)
export function createMail({ key, from, devLog }) {
  const on = !!(key && from) || !!devLog;
  return {
    on,
    async send(to, name, code) {
      if (!on) return;
      if (devLog && !(key && from)) { console.log(`MAILCODE ${name} ${code}`); return; }
      const text = `Hello ${name},\n\nYour Naija Streets code is ${code}\n\nType it in the game to set a new password. It works for 15 minutes.\nIf you did not ask for this, ignore this email; your password stays the same.\n`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject: `Your Naija Streets code: ${code}`, text }),
      });
      if (!r.ok) throw new Error('resend ' + r.status);
    },
  };
}
