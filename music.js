// Eight bars in F, with a swung toy-piano lead and a pizzicato bass.
export async function startMusic(ac, output) {
  const beat = 60 / 124, length = 32 * beat, rate = 32000;
  const mix = new OfflineAudioContext(1, Math.round(length * rate), rate);
  const hz = note => 440 * 2 ** ((note - 69) / 12);
  function note(type, midi, when, duration, volume, overtone = 1) {
    const oscillator = mix.createOscillator(), envelope = mix.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz(midi) * overtone;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(volume, when + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope).connect(mix.destination);
    oscillator.start(when); oscillator.stop(when + duration);
  }
  const chords = [[53,57,60,64],[50,53,57,60],[46,53,57,62],[48,55,58,64],
                  [53,57,60,64],[50,53,57,62],[43,50,53,58],[48,52,55,58]];
  const melody = [[72,0,77,81,79,0,77,0],[74,77,0,72,69,0,0,0],
                  [70,0,74,77,81,0,79,77],[76,0,72,0,67,69,70,0],
                  [72,0,77,81,84,0,81,77],[79,77,0,74,69,0,72,0],
                  [70,74,77,0,79,0,77,74],[76,0,74,72,67,0,0,0]];
  chords.forEach((chord, bar) => {
    for (let step = 0; step < 8; step++) {
      const when = (bar * 4 + Math.floor(step / 2) + (step % 2 ? 0.57 : 0)) * beat;
      const lead = melody[bar][step];
      if (lead) {
        note('triangle', lead, when, 0.28, 0.105);
        note('sine', lead, when, 0.11, 0.045, 3);
      }
      if (step === 0 || step === 4 || step === 7)
        note('triangle', chord[0] - 12 + (step === 4 ? 7 : 0), when, 0.21, 0.16);
      if (step === 2 || step === 6)
        for (const pitch of chord.slice(1)) note('sine', pitch + 12, when, 0.14, 0.035);
      if (step % 2) note('square', 93, when, 0.026, 0.01);
    }
  });
  const loop = ac.createBufferSource();
  loop.buffer = await mix.startRendering(); loop.loop = true;
  loop.connect(output); loop.start();
}
