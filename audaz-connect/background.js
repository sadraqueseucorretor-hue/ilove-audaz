/*
 * AUDAZ CONNECT — service worker.
 * Fase 1: só o selo do ícone. Fase 3 (sincronização com o Audaz) entra aqui,
 * via audazAvailabilityAdapter, sem segredos embutidos na extensão.
 */
'use strict';

const BADGE_COLORS = { '✓': '#3f6b4a', '!': '#8a1f2b', 'E': '#c9861f', '…': '#101c3f' };

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'AC_BADGE' || !sender.tab) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: msg.text || '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[msg.text] || '#101c3f' });
});
