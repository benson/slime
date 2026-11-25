// The seat token stays in the transport. Only the invitation URL reaches this panel.
export function friendLobby(element, actions) {
  const heading = element.querySelector('h1');
  const status = element.querySelector('[role=status]');
  const share = element.querySelector('[data-share]');
  const primary = element.querySelector('[data-primary]');
  const leave = element.querySelector('[data-leave]');
  const manual = element.querySelector('input');
  let action, invitation = '';
  share.textContent = navigator.share ? 'Share invite' : 'Copy invite';
  primary.onclick = () => action?.();
  leave.onclick = actions.leave;
  share.onclick = async () => {
    const url = invitation;
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({title: 'SLIME VOLLEYBALL 2000', url});
      } else {
        await navigator.clipboard.writeText(url);
        if (url === invitation) status.textContent = 'Invite copied.';
      }
    } catch (err) {
      if (err.name === 'AbortError' || url !== invitation) return;
      manual.hidden = false; manual.value = url; manual.focus(); manual.select();
    }
  };
  return {
    show(title, message, label, callback, url = '') {
      const opening = element.hidden;
      heading.textContent = title; status.textContent = message;
      if (url !== invitation) manual.hidden = true;
      action = callback; invitation = url;
      share.hidden = !url; primary.hidden = !label;
      primary.disabled = !callback; primary.textContent = label || '';
      element.hidden = false;
      if (opening) heading.focus({preventScroll:true});
    },
    hide() {
      element.hidden = true; manual.hidden = true; invitation = ''; action = null;
      if (element.contains(document.activeElement)) document.activeElement.blur();
    },
  };
}
