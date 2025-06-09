

;(() => {
	if(typeof window === 'undefined') return;
	// fix for accidental close via browser shortcut ctrl+w, crouch+move forward obviously
	window.addEventListener('beforeunload', function (event) {
		event.preventDefault()
	})
})();
