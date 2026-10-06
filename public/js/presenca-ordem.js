// A ordem segue os cliques de seleção, inclusive ao desmarcar e selecionar novamente.
export function acompanharOrdemPresenca(form, participantes) {
  const ordem = participantes.map(p => p.usuario_id);
  const mostrar = () => {
    form.querySelectorAll('input[name=participante]').forEach(el => {
      const pos = ordem.indexOf(Number(el.value));
      el.closest('label').querySelector('[data-ordem-presenca]')?.remove();
      if (pos >= 0) {
        const selo = document.createElement('span');
        selo.dataset.ordemPresenca = ''; selo.className = 'pilula'; selo.textContent = String(pos + 1);
        el.closest('label').append(selo);
      }
    });
  };
  form.addEventListener('change', ev => {
    const el = ev.target;
    if (!el.matches('input[name=participante]')) return;
    const id = Number(el.value), pos = ordem.indexOf(id);
    if (pos >= 0) ordem.splice(pos, 1);
    if (el.checked) ordem.push(id);
    mostrar();
  });
  mostrar();
  return () => [...ordem];
}
