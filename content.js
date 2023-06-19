let run = async () => {
    let timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        lastScrollY = window.scrollY, speed = 1.75, OVERFLOW = 75, count = { setSpeed: 0, removeSHORTS: 0 }

    window.onscroll = () => {
        if (window.scrollY > lastScrollY) {
            actions()
        }
    }

    setSpeed(true)
    removeFromLocalStorage()

    let INIT = setInterval(() => {
        actions()

        if (document.querySelectorAll('ytd-rich-item-renderer').length > 5) {
            clearInterval(INIT)
        }
    }, 1000)

    function actions() {
        removeShorts()
        removeProgressVideos()
        removeBlacklistedVideos()
    }

    function removeFromLocalStorage() {
        let currentTime = new Date().getTime()

        // Getting the time the check was last run
        let lastChecked = localStorage.getItem('youtubeHelper-lastChecked') ? JSON.parse(localStorage.getItem('youtubeHelper-lastChecked')) : 0

        // If more than a day has passed since last check
        if (currentTime - lastChecked > 24 * 60 * 60 * 1000) {
            // Check local storage for old items
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i)
                let value = JSON.parse(localStorage.getItem(key))

                // Exclude 'lastChecked' from the keys to remove
                if (key === 'youtubeHelper-lastChecked') continue

                // If stored more than 2 weeks ago
                if (currentTime - value.time > 2 * 7 * 24 * 60 * 60 * 1000) {
                    localStorage.removeItem(key)
                }
            }

            // Set the time the check was last run
            localStorage.setItem('youtubeHelper-lastChecked', JSON.stringify(currentTime))
        }
    }

    async function removeShorts() {
        // define function to find closest parent
        function closest(el, selector) {
            let matchesSelector = el.matches || el.webkitMatchesSelector || el.mozMatchesSelector || el.msMatchesSelector

            while (el) {
                if (matchesSelector.call(el, selector)) {
                    return el
                } else {
                    el = el.parentElement
                }
            }
            return null
        }

        // find all elements with SHORTS
        let shorts = Array.from(document.querySelectorAll("ytd-thumbnail-overlay-time-status-renderer"))

        shorts.forEach((element) => {
            let textContent = element.innerText || element.textContent
            if (textContent.includes("SHORTS")) {
                // delete parent element
                let parent = closest(element, 'ytd-rich-item-renderer')
                if (parent) parent?.parentNode?.removeChild(parent)
            }
        })
    }

    async function removeProgressVideos() {
        // Select all video elements
        let videos = document.querySelectorAll('ytd-rich-item-renderer')

        videos.forEach((video) => {
            // Select the progress bar inside the current video
            let progressBar = video.querySelector('#progress')

            if (progressBar) {
                // Extract the numerical value of the width (progress)
                let progress = parseFloat(progressBar?.style?.width)

                // If progress is more than 75%, remove the video
                if (progress > OVERFLOW) {
                    video.remove()
                }
            }
        })

    }

    async function setSpeed(wait = false) {
        console.log('setSpeed')
        count.setSpeed++

        let frame = document.getElementsByClassName("video-stream html5-main-video")[0]

        if (frame) {
            frame.playbackRate = speed
        } else if (wait && count.setSpeed < OVERFLOW) {
            await timeout(500).then(() => setSpeed(true))
        }
    }

    function getName(link) {
        return 'youtubeHelper-' + link
    }

    async function removeBlacklistedVideos() {
        // setInterval(() => {
        // Getting current time
        let currentTime = new Date().getTime()
        let videos = document.querySelectorAll('ytd-rich-item-renderer')

        videos.forEach((video) => {
            let linkElement = video.querySelector('a.yt-simple-endpoint')
            let videoLink = linkElement.getAttribute('href')
            let videoMediaElement = video.querySelector('#details') // Get the 'ytd-rich-grid-media' element

            if (!videoMediaElement.querySelector('.remove-button') && !localStorage.getItem(getName(videoLink))) {
                let closeButton = document.createElement('div')
                closeButton.innerHTML = 'X'
                closeButton.classList.add('remove-button')
                closeButton.style.position = 'absolute'
                closeButton.style.top = '15px'
                closeButton.style.right = '0'
                // closeButton.style.bottom = '0'
                closeButton.style.background = '#CD1818'
                closeButton.style.color = '#fff'
                closeButton.style.width = '30px'
                closeButton.style.height = '30px'
                closeButton.style.lineHeight = '30px' // Vertically center the 'X'
                closeButton.style.textAlign = 'center' // Horizontally center the 'X'
                closeButton.style.cursor = 'pointer'
                closeButton.style.borderRadius = '50%'
                closeButton.onclick = (event) => {
                    event.stopPropagation()

                    video.style.display = 'none'
                    localStorage.setItem(getName(videoLink), JSON.stringify({ time: currentTime, value: true }))
                }
                videoMediaElement.appendChild(closeButton) // Append the closeButton to the 'ytd-rich-grid-media' element
            } else if (localStorage.getItem(getName(videoLink)) && JSON.parse(localStorage.getItem(getName(videoLink))).value) {
                video.style.display = 'none'
            }
        })
        // }, 5000)
    }


    // manual function
    function clearLocalStorage() {
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i)

            // Check if the key contains '/watch?'
            if (key.includes('/watch?')) {
                localStorage.removeItem(key)
                i-- // Decrement the counter as the keys shift when an item is removed
            }
        }
    }
}

run()
