'use strict';

(() => {
  const mode = document.querySelector('#calcMode');
  const stakeInput = document.querySelector('#calcStake');
  const oddsInput = document.querySelector('#calcOdds');
  const placeInput = document.querySelector('#calcPlaceOdds');
  const placeField = document.querySelector('#calcPlaceField');
  const oddsLabel = document.querySelector('#calcOddsLabel');
  const termsNote = document.querySelector('#calcTermsNote');
  const result = document.querySelector('#calcResult');
  const dollars = value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);
  const number = input => Number(input.value);

  function metric(label, value, detail = '') {
    return `<div class="calc-metric"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
  }

  function update() {
    const kind = mode.value;
    const stake = number(stakeInput), price = number(oddsInput), placePrice = number(placeInput);
    placeField.hidden = kind !== 'eachway';
    oddsLabel.textContent = kind === 'multi' ? 'Actual combined decimal odds' : kind === 'eachway' ? 'Win decimal odds' : kind === 'place' ? 'Place decimal odds' : 'Win decimal odds';
    termsNote.textContent = kind === 'eachway'
      ? 'Your total paper stake is split equally between win and place. Use the actual place quote and check paid-place terms.'
      : kind === 'multi'
        ? 'Both selected outcomes must happen. Enter the actual combined quote; individual leg prices are not multiplied.'
        : `If the ${kind === 'place' ? 'horse places under the bookmaker terms' : 'horse wins'}, the gross return includes your stake.`;
    if (!Number.isFinite(stake) || stake <= 0 || stake > 100000 || !Number.isFinite(price) || price <= 1 || price > 10000 || (kind === 'eachway' && (!Number.isFinite(placePrice) || placePrice <= 1 || placePrice > 10000))) {
      result.innerHTML = '<div class="calc-invalid"><strong>Enter a valid stake and actual decimal odds.</strong><p>Stake must be above $0 and odds above 1.00.</p></div>';
      return;
    }

    if (kind === 'eachway') {
      const half = stake / 2;
      const bothGross = half * price + half * placePrice;
      const placeGross = half * placePrice;
      result.innerHTML = `<p class="eyebrow">POSSIBLE PAPER RETURNS</p><h2>Each way</h2><p class="calc-subhead">${dollars(half)} win + ${dollars(half)} place</p><div class="calc-metrics">${metric('If the horse wins', dollars(bothGross), `Gross return · net ${dollars(bothGross - stake)}`)}${metric('If it places, without winning', dollars(placeGross), `Gross return · net ${dollars(placeGross - stake)}`)}${metric('If it misses a paid place', dollars(0), `Net ${dollars(-stake)}`)}</div><p class="calc-disclaimer">These are simple outcomes before deductions, dead heats or special terms. Check the bookmaker’s place rules.</p>`;
      return;
    }

    const gross = stake * price;
    const chance = 100 / price;
    result.innerHTML = `<p class="eyebrow">POSSIBLE PAPER RETURN</p><h2>${kind === 'multi' ? 'Same-race multi' : kind === 'place' ? 'Place' : 'Win'}</h2><p class="calc-subhead">${dollars(stake)} at ${price.toFixed(2)} decimal odds</p><div class="calc-metrics">${metric('Gross return if successful', dollars(gross), 'Includes the original paper stake')}${metric('Net paper profit if successful', dollars(gross - stake))}${metric('Break-even success rate', `${chance.toFixed(1)}%`, 'Odds-derived threshold, not a predicted chance')}</div><p class="calc-disclaimer">If unsuccessful, the net paper result is −${dollars(stake)}. Deductions, dead heats and special terms are not calculated.</p>`;
  }

  for (const input of [mode, stakeInput, oddsInput, placeInput]) input.addEventListener('input', update);
  document.querySelector('#calcForm').addEventListener('submit', event => event.preventDefault());
  update();
})();
