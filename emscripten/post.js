;(() => {
	// Also loaded inside pthread workers, which have no DOM.
	if(typeof window === 'undefined' || typeof document === 'undefined') return;

	const host = window.GameHost || {};

	// The shell already told the player what is missing. Park main() here rather
	// than letting startup fail somewhere deep in the runtime with a stack trace
	// nobody can act on. This dependency is deliberately never removed.
	if(host.supported === false) {
		addRunDependency('unsupported-browser')
		return
	}

	// fix for accidental close via browser shortcut ctrl+w, crouch+move forward obviously
	window.addEventListener('beforeunload', function (event) {
		// Only once there is a session worth protecting, otherwise every
		// navigation away from the loading screen prompts for nothing.
		if(!host.started) return;
		event.preventDefault();
		event.returnValue = '';
	})

	canvasElement.onkeypress = e => e.preventDefault()

	// iOS reclaims the WebGL context whenever the tab is backgrounded or memory
	// gets tight. Emscripten cannot rebuild the engine's GL state, so tell the
	// player instead of leaving them on a frozen frame.
	canvasElement.addEventListener('webglcontextrestored', () => {
		console.warn('WebGL context restored; engine state cannot be recovered')
	}, false)

	// Hold main() until the player taps. iOS refuses to start an AudioContext,
	// enter fullscreen or lock orientation outside a user gesture, so the engine
	// must not initialise before we have one.
	addRunDependency('user-gesture')
	let gestureReleased = false
	window.addEventListener('gamehost:play', () => {
		if(gestureReleased) return
		gestureReleased = true
		removeRunDependency('user-gesture')
	}, { once: true })

	addRunDependency('load_game_data')
	dataLoader.loadMapWithDeps('background1').then(() => {
		removeRunDependency('load_game_data')
		if(typeof window.showPlayGate === 'function') window.showPlayGate()
	}, err => {
		console.error(err)
		if(typeof window.showFatal === 'function') {
			window.showFatal('Could not load game data',
				String(err && err.message || err) +
				'\n\nThe packed map chunks must be served from ./chunks/ next to this page.')
		}
	})
})();
