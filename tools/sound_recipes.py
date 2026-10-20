# The cuts used for the game's sounds (read by tools/sound_build.py). a: start (s), d: length (s), level: loudness (dB RMS)
# beds: stereo loops heard everywhere around a kind of place; loops: short engine / machine loops; shots: one-offs.
# spot_*: loops played in 3-D at a place (the conductors at a bus stop, the hawkers in a market).
RECIPES.update({
    # --- the city (SFXAFRIK's Nigerian field recordings)
    'amb_traffic':  dict(src=582367, a=110, d=70, kind='bed', level=-24, hp=60),
    'amb_busstop':  dict(src=582955, a=80, d=70, kind='bed', level=-25, hp=80),
    'amb_market':   dict(src=582962, a=55, d=60, kind='bed', level=-25, hp=80),
    'spot_cond_1':  dict(src=582935, a=0, d=58, kind='loop', level=-20, hp=120, xf=1.5),
    'spot_cond_2':  dict(src=582935, a=96, d=60, kind='loop', level=-20, hp=120, xf=1.5),
    'spot_market':  dict(src=582962, a=0, d=50, kind='loop', level=-20, hp=120, xf=1.5),
    'amb_estate':   dict(src=727132, a=72, d=62, kind='bed', level=-27, hp=80),
    'amb_night':    dict(src=608207, a=20, d=70, kind='bed', level=-28, hp=60),
    'amb_morning':  dict(src=727135, a=10, d=70, kind='bed', level=-27, hp=60),
    'amb_rain':     dict(src=132823, a=150, d=50, kind='bed', level=-24),
    'amb_rainroof': dict(src=132823, a=240, d=38, kind='bed', level=-22),
    'amb_airport':  dict(src=333226, a=20, d=60, kind='bed', level=-27, hp=80),
    'church':       dict(src=727136, a=0, d=60, kind='loop', level=-22, hp=100, xf=2),
    'adhan':        dict(src=255231, a=8, d=148, kind='shot', level=-20, fi=1, fo=3),
    'gen':          dict(src=367175, a=4, d=6, kind='loop', level=-20, xf=.4),
    'jet':          dict(src=465054, a=20, d=14, kind='loop', level=-18, xf=1),
    'thunder':      dict(src=243778, a=.5, d=14, kind='shot', fo=3),
    # --- vehicles
    'eng_okada':    dict(src=518173, a=2, d=4, kind='loop', level=-20, xf=.3, r0=.8, r1=.55),
    'eng_keke':     dict(src=261059, a=14, d=4, kind='loop', level=-20, xf=.3, r0=.85, r1=.6),
    'eng_danfo':    dict(src=453994, a=10, d=5, kind='loop', level=-20, xf=.4, r0=.9, r1=.7),
    'eng_car':      dict(src=147242, a=0, d=3.6, kind='loop', level=-21, xf=.3, r0=.75, r1=.65),
    'eng_truck':    dict(src=453415, a=5, d=5, kind='loop', level=-19, xf=.4, r0=.9, r1=.55),
    'horn_car':     dict(src=423990, kind='shot', fo=.03),
    'horn_okada':   dict(src=153049, kind='shot', fo=.05),
    'horn_truck':   dict(src=513741, kind='shot', fo=.05),
    'horn_bus':     dict(src=504565, a=.5, d=2.3, kind='shot', fo=.12),
    'skid':         dict(src=454687, a=11.6, d=1.6, kind='loop', level=-18, xf=.2),
    'crash':        dict(src=237375, kind='shot', fo=.3),
    'door':         dict(src=556689, kind='shot', fo=.1),
    'siren':        dict(src=70936, a=5.2, d=9.4, kind='loop', level=-20, xf=.25),
})
# --- music (Pixabay Content License): whole songs for the radio, the club, homes and the area boys' speakers
SONGS = [
    ('mu_duro', 'Duro', 'kontraa', 'afrobeats', 'afrobeat-duro-afro-pop-music-278978'),
    ('mu_water', 'Water', 'kontraa', 'afrobeats', 'afrobeat-water-afro-pop-music-445661'),
    ('mu_naijalove', 'Naija Love', 'PremiumMusicOdyssey', 'afrobeats', 'afrobeat-naija-love-245453'),
    ('mu_afrobeat', 'Afrobeat Music', 'soundoffreedom', 'afrobeats', 'upbeat-afrobeat-music-422623'),
    ('mu_wordle', 'Wordle', 'kontraa', 'amapiano', 'afrobeat-wordle-amapiano-music-149474'),
    ('mu_unlockme', 'Unlock Me', 'kontraa', 'amapiano', 'upbeat-unlock-me-amapiano-music-149058'),
    ('mu_matchout', 'Match Out', 'artbybigvee', 'amapiano', 'afrobeat-match-out-free-afro-amapiano-instrumental-178406'),
    ('mu_nigparty', 'Nigerian Party', 'u_98673jp944', 'highlife', 'upbeat-nigerian-party-310982'),
    ('mu_jujuwaves', 'Juju Waves', 'Free_Audio_Library', 'highlife', 'afrobeat-juju-waves-302586'),
    ('mu_lagoshigh', 'Lagos Highlife', 'u_98673jp944', 'highlife', 'upbeat-lagos-highlife-344786'),
    ('mu_wadud', 'Wadud', 'kontraa', 'street', 'afrobeat-wadud-afro-drill-music-440945'),
    ('mu_whip', 'Whip', 'kontraa', 'street', 'beats-whip-afro-dancehall-music-110235'),
    ('mu_sisicaro', 'Sisi Caro', 'BabaBellz', 'street', 'afrobeat-bababellz-sisi-caro-prod-by-drimz-beat-387220'),
]
for n, t, a, g, page in SONGS:
    RECIPES[n] = dict(src=n, kind='song', title=t, artist=a, genre=g)
    MUSIC_URL[n] = f'https://pixabay.com/music/{page}/'
RECIPES.update({
    'dj_horn':      dict(src='fx_airhorn', kind='shot', fo=.2),
    'dj_scratch':   dict(src='fx_scratch', kind='shot', fo=.1),
    'radio_static': dict(src='fx_static', a=2, d=1.1, kind='shot', level=-24, fi=.02, fo=.25),
    'radio_jingle': dict(src='fx_jingle', kind='shot', fo=.2),
})
