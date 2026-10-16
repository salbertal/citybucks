Subject: City Bucks is playable again 🎉

Hi Philipp,

Thank you again for sharing the VersusPad repo with me. I played City Bucks as a kid on my grandmother's iPad, and I wanted to tell you that thanks to you it's alive again:

▶ Play (2 players on one screen, works great on an iPad): https://salbertal.github.io/citybucks/
▶ Online 1-vs-1 (each player on their own computer): https://salbertal.github.io/citybucks/online.html
▶ Source: https://github.com/salbertal/citybucks

A short version of the story: the CityBucksForTwo folder in your repo turned out to be the early 0.9 prototype (no citizens yet). But someone had preserved the App Store v1.0 IPA on archive.org, and since it's a PhoneGap app, the original www folder was inside, intact. So this is your real 1.0 game, not a remake.

I left your original files untouched and added a small compatibility layer around them so it runs in today's browsers:
- the iPad touch code path now works with mouse, trackpad and touch (including two players dragging at the same time on a tablet)
- PhoneGap's Media API is replaced with Web Audio
- the 768×1024 board scales to any screen
- every citizen is now drawn on each frame (on the iPad 1 you limited it to 30 per frame), so the movement is much smoother
- two small bugs are fixed: Restart was adding a second game loop each time, which sped the game up, and the "fire-small" sound pointed to a file named "firesmall.mp3"
- the old news/cross-promo request is turned off, so the game never contacts any server

I also added an online mode. One player's browser runs the game and the other sees a live mirror over WebRTC (peer to peer, free, no accounts). Each player sees their own bar at the bottom.

Your name and credits stay everywhere, the code keeps your GPL v2 license, and the README links back to VersusPad and your repo. If you'd like anything changed, for example how you're credited, or if you'd prefer it taken down, just tell me and I'll do it right away. And if you ever want to link to it or host it yourself, it's all yours.

Thanks for making such a lovely game. It was really special to play it again.

Best,
Santi
