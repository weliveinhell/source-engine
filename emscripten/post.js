

;(() => {
	if(typeof window === 'undefined') return;
	// fix for accidental close via browser shortcut ctrl+w, crouch+move forward obviously
	window.addEventListener('beforeunload', function (event) {
		event.preventDefault()
	})

	addRunDependency('load_game_data')
	dataLoader.loadMapCached('background1').then(x => {
		removeRunDependency('load_game_data')
	})
})();
