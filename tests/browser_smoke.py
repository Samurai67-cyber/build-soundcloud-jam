"""Run against a started server with Python Playwright and system Chromium."""
import os
from playwright.sync_api import sync_playwright

url = os.getenv('JAM_TEST_URL', 'http://localhost:3000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM', '/usr/bin/chromium'), args=['--no-sandbox'])
    host = browser.new_page()
    host.goto(url)
    host.locator('.bigplay').click()
    host.wait_for_function("audio.currentTime > .3")
    host.locator('#jam').click()
    link = host.locator('#invite').input_value()
    host.locator('[aria-label="Close"]').click()
    host.wait_for_function("state.jam && !audio.paused")
    errors = []
    def verify():
        # Bracket the guest measurement with host samples on a common clock.
        guest.wait_for_function("!audio.paused && audio.currentTime > 0")
        a = host.locator('audio').evaluate('(a)=>a.currentTime')
        b = guest.locator('audio').evaluate('(a)=>a.currentTime')
        c = host.locator('audio').evaluate('(a)=>a.currentTime')
        delta = abs((a+c)/2-b)
        errors.append(round(delta,3))
        assert delta <= 1.5, delta
    for trial in range(5):
        ctx = browser.new_context(viewport={'width':390,'height':844})
        guest = ctx.new_page()
        guest.goto(link)
        guest.locator('#joinListen').click()
        guest.wait_for_timeout(500)
        verify()
        host.locator('#wave').click(position={'x':65+trial*38,'y':20})
        guest.wait_for_timeout(500)
        verify()
        assert guest.locator('#next').is_disabled()
        if trial < 4:
            ctx.close()
    guest.locator('#add').click()
    guest.locator('.pick').last.click()
    host.wait_for_function("state.queue.length===4")
    guest.get_by_role('button',name='React 🔥').click()
    host.wait_for_function("document.querySelector('#markers').innerText.includes('🔥')")
    host.locator('.bigplay').click()
    guest.wait_for_function("audio.paused")
    host.locator('#next').click()
    guest.wait_for_function("state.track.title==='Low Tide'")
    guest.reload()
    guest.locator('#joinListen').click()
    guest.wait_for_function("state.track.title==='Low Tide'")
    host.close()
    guest.wait_for_function("!state.hostOnline && !state.playing")
    print('Absolute media-time differences (seconds), alternating join and seek:', errors)
    print('Queue addition, reaction, pause, skip, guest reload and host disconnect passed.')
    browser.close()
