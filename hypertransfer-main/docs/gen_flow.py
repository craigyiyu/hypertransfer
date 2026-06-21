#!/usr/bin/env python3
"""Generate a branded, hand-laid-out SVG flow diagram for the HyperTransfer app."""
import html

W = 1680
# palette
BG = "#0a0a0c"
PANEL = "#141419"
PANEL_BORDER = "#26262e"
INK = "#ececf1"
MUTED = "#9a9aa6"
GOLD = "#d4af37"
GOLD_BRIGHT = "#f2d479"
API = "#11203a"
API_BORDER = "#3b6ea5"
API_INK = "#bcd6f5"
DEC = "#2c2510"
DEC_BORDER = "#caa12e"
DEC_INK = "#ffe6a0"
DANGER = "#3a1414"
DANGER_BORDER = "#ef4444"
DANGER_INK = "#fecaca"
DONE = "#0e2a1c"
DONE_BORDER = "#2bbd7e"
DONE_INK = "#bdf3d6"
VEN = "#1c1630"
VEN_BORDER = "#9d7bf0"
VEN_INK = "#cdb8f7"
FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

parts = []
def add(s): parts.append(s)

nodes = {}
def node(nid, cx, top, w, h, kind="card"):
    nodes[nid] = dict(cx=cx, top=top, w=w, h=h, kind=kind,
                      left=cx-w/2, right=cx+w/2, bot=top+h, midy=top+h/2)
    return nodes[nid]

def esc(t): return html.escape(t)

def draw_card(n, title, sub=None, fill=PANEL, border=PANEL_BORDER, ink=INK, sub_ink=MUTED, tag=None, accent=None, vendor=None):
    x, y, w, h = n["left"], n["top"], n["w"], n["h"]
    # vendor nodes get a violet left bar to signal a third-party service
    if vendor:
        accent = VEN_BORDER
    add(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" rx="12" ry="12" fill="{fill}" stroke="{border}" stroke-width="1.5"/>')
    if accent:
        add(f'<rect x="{x:.0f}" y="{y:.0f}" width="5" height="{h:.0f}" rx="2.5" fill="{accent}"/>')
    cy = n["midy"]
    if sub and vendor:
        add(f'<text x="{n["cx"]:.0f}" y="{cy-17:.0f}" font-family="{FONT}" font-size="19" font-weight="700" fill="{ink}" text-anchor="middle">{esc(title)}</text>')
        add(f'<text x="{n["cx"]:.0f}" y="{cy+3:.0f}" font-family="{FONT}" font-size="13" fill="{sub_ink}" text-anchor="middle">{esc(sub)}</text>')
        add(f'<text x="{n["cx"]:.0f}" y="{cy+24:.0f}" font-family="{FONT}" font-size="12.5" font-weight="700" fill="{VEN_INK}" text-anchor="middle">{esc("▲ " + vendor)}</text>')
    elif sub:
        add(f'<text x="{n["cx"]:.0f}" y="{cy-6:.0f}" font-family="{FONT}" font-size="19" font-weight="700" fill="{ink}" text-anchor="middle">{esc(title)}</text>')
        add(f'<text x="{n["cx"]:.0f}" y="{cy+15:.0f}" font-family="{FONT}" font-size="13.5" fill="{sub_ink}" text-anchor="middle">{esc(sub)}</text>')
    else:
        add(f'<text x="{n["cx"]:.0f}" y="{cy+6:.0f}" font-family="{FONT}" font-size="19" font-weight="700" fill="{ink}" text-anchor="middle">{esc(title)}</text>')
    if tag:
        tw = 8.2*len(tag)+18
        add(f'<rect x="{n["right"]-tw-10:.0f}" y="{y+10:.0f}" width="{tw:.0f}" height="20" rx="10" fill="none" stroke="{border}" stroke-width="1"/>')
        add(f'<text x="{n["right"]-10-tw/2:.0f}" y="{y+24:.0f}" font-family="{FONT}" font-size="11" font-weight="700" fill="{sub_ink}" text-anchor="middle" letter-spacing="0.5">{esc(tag)}</text>')

def draw_api(n, title, sub):
    draw_card(n, title, sub, fill=API, border=API_BORDER, ink="#ffffff", sub_ink=API_INK, tag="API", accent=API_BORDER)

def draw_pill(n, title, fill=PANEL, border=GOLD, ink=GOLD_BRIGHT):
    x, y, w, h = n["left"], n["top"], n["w"], n["h"]
    add(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" rx="{h/2:.0f}" fill="{fill}" stroke="{border}" stroke-width="1.5"/>')
    add(f'<text x="{n["cx"]:.0f}" y="{n["midy"]+6:.0f}" font-family="{FONT}" font-size="17" font-weight="700" fill="{ink}" text-anchor="middle">{esc(title)}</text>')

def draw_diamond(n, l1, l2=None):
    cx, cy = n["cx"], n["midy"]
    w, h = n["w"], n["h"]
    pts = f'{cx:.0f},{n["top"]:.0f} {n["right"]:.0f},{cy:.0f} {cx:.0f},{n["bot"]:.0f} {n["left"]:.0f},{cy:.0f}'
    add(f'<polygon points="{pts}" fill="{DEC}" stroke="{DEC_BORDER}" stroke-width="1.5"/>')
    if l2:
        add(f'<text x="{cx:.0f}" y="{cy-4:.0f}" font-family="{FONT}" font-size="15" font-weight="700" fill="{DEC_INK}" text-anchor="middle">{esc(l1)}</text>')
        add(f'<text x="{cx:.0f}" y="{cy+16:.0f}" font-family="{FONT}" font-size="13" fill="#d8c48a" text-anchor="middle">{esc(l2)}</text>')
    else:
        add(f'<text x="{cx:.0f}" y="{cy+6:.0f}" font-family="{FONT}" font-size="15" font-weight="700" fill="{DEC_INK}" text-anchor="middle">{esc(l1)}</text>')

def arrow(x1, y1, x2, y2, label=None, lpos=0.5, dashed=False, color="#5a5a66"):
    dash = ' stroke-dasharray="5 5"' if dashed else ''
    add(f'<path d="M {x1:.0f} {y1:.0f} L {x2:.0f} {y2:.0f}" fill="none" stroke="{color}" stroke-width="2"{dash} marker-end="url(#ah)"/>')
    if label:
        lx, ly = x1+(x2-x1)*lpos, y1+(y2-y1)*lpos
        place_label(lx, ly, label)

def elbow(x1, y1, x2, y2, label=None, dashed=False, color="#5a5a66"):
    # vertical from (x1,y1) to midy, then horizontal to x2, then short into (x2,y2)
    dash = ' stroke-dasharray="5 5"' if dashed else ''
    add(f'<path d="M {x1:.0f} {y1:.0f} L {x1:.0f} {y2:.0f} L {x2:.0f} {y2:.0f}" fill="none" stroke="{color}" stroke-width="2"{dash} marker-end="url(#ah)"/>')
    if label:
        place_label(x1, (y1+y2)/2, label)

def hline(x1, y, x2, label=None, color="#5a5a66"):
    add(f'<path d="M {x1:.0f} {y:.0f} L {x2:.0f} {y:.0f}" fill="none" stroke="{color}" stroke-width="2" marker-end="url(#ah)"/>')
    if label: place_label((x1+x2)/2, y, label)

def place_label(lx, ly, label):
    tw = 7.0*len(label)+14
    add(f'<rect x="{lx-tw/2:.0f}" y="{ly-11:.0f}" width="{tw:.0f}" height="22" rx="11" fill="{BG}" stroke="{PANEL_BORDER}" stroke-width="1"/>')
    add(f'<text x="{lx:.0f}" y="{ly+4:.0f}" font-family="{FONT}" font-size="12" font-weight="700" fill="{GOLD_BRIGHT}" text-anchor="middle">{esc(label)}</text>')

def phase_panel(x, y, w, h, num, name):
    add(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" rx="18" fill="#101015" stroke="{PANEL_BORDER}" stroke-width="1.2"/>')
    # header chip
    chw = 22*1 + 12*len(name) + 70
    add(f'<rect x="{x+22:.0f}" y="{y-16:.0f}" width="{chw:.0f}" height="32" rx="16" fill="{BG}" stroke="{GOLD}" stroke-width="1.3"/>')
    add(f'<circle cx="{x+22+18:.0f}" cy="{y:.0f}" r="11" fill="{GOLD}"/>')
    add(f'<text x="{x+22+18:.0f}" y="{y+4:.0f}" font-family="{FONT}" font-size="13" font-weight="800" fill="#1a1300" text-anchor="middle">{num}</text>')
    add(f'<text x="{x+22+38:.0f}" y="{y+5:.0f}" font-family="{FONT}" font-size="15" font-weight="700" fill="{GOLD_BRIGHT}" letter-spacing="0.6">{esc(name)}</text>')

# ---------------- layout coordinates ----------------
LEFT = 580
RIGHT = 1300
CENTER = 840
CW, CH = 330, 66
CH3 = 84          # taller card for third-party-vendor nodes (3 text lines)
DIA = (300, 92)
CYL = (320, 68)

# Build node geometry
node("start", CENTER, 132, 300, 44, "pill")
node("landing", CENTER, 210, CW, CH)

# phase1 left chain
node("reg",      LEFT, 360, CW, CH)
node("otp",      LEFT, 458, CW, CH)
node("otpdec",   LEFT, 556, *DIA, "dec")
node("regapi",   LEFT, 678, *CYL, "api")
node("setup",    LEFT, 772, CW, CH)
node("enroll",   LEFT, 868, *DIA, "dec")
node("regen",    925,  872, 190, 56, "side")
node("confapi",  LEFT, 996, *CYL, "api")

# phase2 right chain
node("login",    RIGHT, 360, CW, CH)
node("loginapi", RIGHT, 458, *CYL, "api")
node("v2fa",     RIGHT, 560, *DIA, "dec")
node("verapi",   RIGHT, 686, *CYL, "api")
node("forgot",   RIGHT, 800, CW, 56, "side")

# converge
node("kyc",      CENTER, 1140, CW, CH3)
node("kycsub",   CENTER, 1238, *CYL, "api")
node("kycdec",   CENTER, 1338, *DIA, "dec")
node("kycwait",  1230,   1338, 220, 60, "side")
node("dash",     CENTER, 1470, 420, 72)

# phase4 deposit spine
DSP = 700
DR = 1300
node("nd",       DSP, 1620, CW, CH)
node("ws",       DSP, 1712, CW, CH3)
node("kyt",      DSP, 1816, *DIA, "dec")
node("blocked",  DR,  1820, 250, 78, "stop")
node("addr",     DSP, 1938, CW, CH3)
node("verify",   DSP, 2042, CW, CH)
node("vermon",   DSP, 2138, *DIA, "dec")
node("amt",      DSP, 2260, CW, CH)
node("trdec",    DSP, 2358, *DIA, "dec")
node("tr",       DR,  2354, 250, CH3, "side")
node("send",     DSP, 2470, CW, CH)
node("mainmon",  DSP, 2566, *DIA, "dec")
node("success",  DSP, 2688, CW, 72, "done")
node("settle",   DSP, 2792, 360, 72)

H = 3010

# ---------------- emit ----------------
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">')
add('<defs>')
add(f'<marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="#7a7a86"/></marker>')
add(f'<linearGradient id="goldg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_BRIGHT}"/></linearGradient>')
add('</defs>')
add(f'<rect width="{W}" height="{H}" fill="{BG}"/>')

# header
add(f'<rect x="40" y="34" width="56" height="56" rx="14" fill="none" stroke="url(#goldg)" stroke-width="2"/>')
add(f'<path d="M68 46 l16 7 v10 c0 11 -8 17 -16 21 c-8 -4 -16 -10 -16 -21 v-10 z" fill="none" stroke="{GOLD_BRIGHT}" stroke-width="2"/>')
add(f'<text x="112" y="60" font-family="{FONT}" font-size="30" font-weight="800" fill="{GOLD_BRIGHT}" letter-spacing="0.4">HyperTransfer</text>')
add(f'<text x="113" y="84" font-family="{FONT}" font-size="15" fill="{MUTED}" letter-spacing="0.5">Application Flow — every process inside the client app</text>')
add(f'<rect x="{W-250:.0f}" y="44" width="210" height="26" rx="13" fill="none" stroke="{PANEL_BORDER}"/>')
add(f'<text x="{W-145:.0f}" y="61" font-family="{FONT}" font-size="12.5" fill="{MUTED}" text-anchor="middle" letter-spacing="0.5">MOCK-UP BUILD · 2026</text>')
add(f'<line x1="40" y1="108" x2="{W-40:.0f}" y2="108" stroke="{PANEL_BORDER}" stroke-width="1"/>')

# phase panels (behind nodes)
phase_panel(300, 330, 720, 730, "1", "NEW-USER ONBOARDING")
phase_panel(1045, 330, 595, 560, "2", "RETURNING-USER LOGIN")
phase_panel(560, 1110, 880, 320, "3", "IDENTITY VERIFICATION (KYC)")
phase_panel(300, 1590, 1340, 1290, "4", "DEPOSIT SESSION")

# connectors (draw before nodes so nodes sit on top)
def C(a): return nodes[a]
# start->landing
arrow(C("start")["cx"], C("start")["bot"], C("landing")["cx"], C("landing")["top"])
# landing split
arrow(C("landing")["left"]+70, C("landing")["bot"], C("reg")["cx"], C("reg")["top"], "New user")
arrow(C("landing")["right"]-70, C("landing")["bot"], C("login")["cx"], C("login")["top"], "Returning", lpos=0.18)
# onboarding chain
arrow(C("reg")["cx"], C("reg")["bot"], C("otp")["cx"], C("otp")["top"])
arrow(C("otp")["cx"], C("otp")["bot"], C("otpdec")["cx"], C("otpdec")["top"])
arrow(C("otpdec")["cx"], C("otpdec")["bot"], C("regapi")["cx"], C("regapi")["top"], "valid")
# otp invalid loop back to otp (left side)
add(f'<path d="M {C("otpdec")["left"]:.0f} {C("otpdec")["midy"]:.0f} L {C("otp")["left"]-40:.0f} {C("otpdec")["midy"]:.0f} L {C("otp")["left"]-40:.0f} {C("otp")["midy"]:.0f} L {C("otp")["left"]:.0f} {C("otp")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
place_label(C("otp")["left"]-40, (C("otpdec")["midy"]+C("otp")["midy"])/2, "resend")
arrow(C("regapi")["cx"], C("regapi")["bot"], C("setup")["cx"], C("setup")["top"])
arrow(C("setup")["cx"], C("setup")["bot"], C("enroll")["cx"], C("enroll")["top"])
# enroll expired -> regen (right) -> loop back up to setup
hline(C("enroll")["right"], C("enroll")["midy"], C("regen")["left"], "expired")
add(f'<path d="M {C("regen")["cx"]:.0f} {C("regen")["top"]:.0f} L {C("regen")["cx"]:.0f} {C("setup")["midy"]:.0f} L {C("setup")["right"]:.0f} {C("setup")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
arrow(C("enroll")["cx"], C("enroll")["bot"], C("confapi")["cx"], C("confapi")["top"], "valid")
# confirm -> KYC (down then to center)
add(f'<path d="M {C("confapi")["cx"]:.0f} {C("confapi")["bot"]:.0f} L {C("confapi")["cx"]:.0f} {C("kyc")["midy"]:.0f} L {C("kyc")["left"]:.0f} {C("kyc")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
# login chain
arrow(C("login")["cx"], C("login")["bot"], C("loginapi")["cx"], C("loginapi")["top"])
arrow(C("loginapi")["cx"], C("loginapi")["bot"], C("v2fa")["cx"], C("v2fa")["top"])
arrow(C("v2fa")["cx"], C("v2fa")["bot"], C("verapi")["cx"], C("verapi")["top"], "valid")
# v2fa invalid -> back to login (right side)
add(f'<path d="M {C("v2fa")["right"]:.0f} {C("v2fa")["midy"]:.0f} L {C("login")["right"]+40:.0f} {C("v2fa")["midy"]:.0f} L {C("login")["right"]+40:.0f} {C("login")["midy"]:.0f} L {C("login")["right"]:.0f} {C("login")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
place_label(C("login")["right"]+40, (C("v2fa")["midy"]+C("login")["midy"])/2, "retry")
# forgot dashed
add(f'<path d="M {C("login")["cx"]:.0f} {C("login")["bot"]:.0f} L {C("forgot")["cx"]:.0f} {C("forgot")["top"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#ah)"/>')
# verify -> KYC (down then center)
add(f'<path d="M {C("verapi")["cx"]:.0f} {C("verapi")["bot"]:.0f} L {C("verapi")["cx"]:.0f} {C("kyc")["midy"]:.0f} L {C("kyc")["right"]:.0f} {C("kyc")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
# kyc chain
arrow(C("kyc")["cx"], C("kyc")["bot"], C("kycsub")["cx"], C("kycsub")["top"])
arrow(C("kycsub")["cx"], C("kycsub")["bot"], C("kycdec")["cx"], C("kycdec")["top"])
hline(C("kycdec")["right"], C("kycdec")["midy"], C("kycwait")["left"], "pending")
add(f'<path d="M {C("kycwait")["cx"]:.0f} {C("kycwait")["top"]:.0f} L {C("kycwait")["cx"]:.0f} {C("kycsub")["midy"]:.0f} L {C("kycsub")["right"]:.0f} {C("kycsub")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
arrow(C("kycdec")["cx"], C("kycdec")["bot"], C("dash")["cx"], C("dash")["top"], "approved")
# dash -> deposit
arrow(C("dash")["cx"], C("dash")["bot"], C("nd")["cx"], C("nd")["top"], "start deposit")
# deposit spine
arrow(C("nd")["cx"], C("nd")["bot"], C("ws")["cx"], C("ws")["top"])
arrow(C("ws")["cx"], C("ws")["bot"], C("kyt")["cx"], C("kyt")["top"])
hline(C("kyt")["right"], C("kyt")["midy"], C("blocked")["left"], "fail / EDD")
arrow(C("kyt")["cx"], C("kyt")["bot"], C("addr")["cx"], C("addr")["top"], "pass")
arrow(C("addr")["cx"], C("addr")["bot"], C("verify")["cx"], C("verify")["top"])
arrow(C("verify")["cx"], C("verify")["bot"], C("vermon")["cx"], C("vermon")["top"])
# vermon self-wait loop (left)
add(f'<path d="M {C("vermon")["left"]:.0f} {C("vermon")["midy"]:.0f} L {C("vermon")["left"]-55:.0f} {C("vermon")["midy"]:.0f} L {C("vermon")["left"]-55:.0f} {C("vermon")["top"]-6:.0f} L {C("vermon")["cx"]-6:.0f} {C("vermon")["top"]-6:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
place_label(C("vermon")["left"]-55, C("vermon")["midy"]-26, "awaiting")
arrow(C("vermon")["cx"], C("vermon")["bot"], C("amt")["cx"], C("amt")["top"], "confirmed")
arrow(C("amt")["cx"], C("amt")["bot"], C("trdec")["cx"], C("trdec")["top"])
# travel rule branch (right) and loop back to amt
hline(C("trdec")["right"], C("trdec")["midy"], C("tr")["left"], "= USD 8,000+")
add(f'<path d="M {C("tr")["cx"]:.0f} {C("tr")["top"]:.0f} L {C("tr")["cx"]:.0f} {C("amt")["midy"]:.0f} L {C("amt")["right"]:.0f} {C("amt")["midy"]:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
arrow(C("trdec")["cx"], C("trdec")["bot"], C("send")["cx"], C("send")["top"], "below")
arrow(C("send")["cx"], C("send")["bot"], C("mainmon")["cx"], C("mainmon")["top"])
add(f'<path d="M {C("mainmon")["left"]:.0f} {C("mainmon")["midy"]:.0f} L {C("mainmon")["left"]-55:.0f} {C("mainmon")["midy"]:.0f} L {C("mainmon")["left"]-55:.0f} {C("mainmon")["top"]-6:.0f} L {C("mainmon")["cx"]-6:.0f} {C("mainmon")["top"]-6:.0f}" fill="none" stroke="#5a5a66" stroke-width="2" marker-end="url(#ah)"/>')
place_label(C("mainmon")["left"]-55, C("mainmon")["midy"]-26, "awaiting")
arrow(C("mainmon")["cx"], C("mainmon")["bot"], C("success")["cx"], C("success")["top"], "confirmed")
arrow(C("success")["cx"], C("success")["bot"], C("settle")["cx"], C("settle")["top"])
# success -> another deposit (far-right side loop up to nd)
LOOPX = 1560
add(f'<path d="M {C("success")["right"]:.0f} {C("success")["midy"]:.0f} L {LOOPX:.0f} {C("success")["midy"]:.0f} L {LOOPX:.0f} {C("nd")["midy"]:.0f} L {C("nd")["right"]:.0f} {C("nd")["midy"]:.0f}" fill="none" stroke="#454552" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#ah)"/>')
place_label(LOOPX, (C("success")["midy"]+C("nd")["midy"])/2, "another deposit")

# ---------------- nodes ----------------
draw_pill(nodes["start"], "User opens HyperTransfer")
draw_card(nodes["landing"], "Landing", "Register or Sign in")

draw_card(nodes["reg"], "Register", "name · email · phone")
draw_card(nodes["otp"], "Send SMS OTP", "first factor · 60s resend cooldown", accent=GOLD)
draw_diamond(nodes["otpdec"], "OTP valid?", "+ set password")
draw_api(nodes["regapi"], "Register", "POST /api/register")
draw_card(nodes["setup"], "Set up MFA", "TOTP MFA · Google / Microsoft / Authy app", accent=GOLD)
draw_diamond(nodes["enroll"], "TOTP valid?", "10-min enrol window")
draw_card(nodes["regen"], "Regenerate QR", None)
draw_api(nodes["confapi"], "Enable MFA", "POST /api/confirm-totp")

draw_card(nodes["login"], "Login", "email / phone + password")
draw_api(nodes["loginapi"], "Start login", "POST /api/login/start")
draw_diamond(nodes["v2fa"], "MFA valid?", "TOTP or recovery code")
draw_api(nodes["verapi"], "Verify login", "POST /api/login/verify")
draw_card(nodes["forgot"], "Forgot password", "reset via SMS OTP", sub_ink=MUTED)

draw_card(nodes["kyc"], "KYC form", "ID type · number · document upload", vendor="KYC vendor · Sumsub / Onfido")
draw_api(nodes["kycsub"], "Submit KYC", "status -> pending")
draw_diamond(nodes["kycdec"], "Approved?")
draw_card(nodes["kycwait"], "Awaiting review", None)
draw_card(nodes["dash"], "Dashboard", "balance · history · deposit · settings", accent=GOLD)

draw_card(nodes["nd"], "New Deposit", "select asset + network")
draw_card(nodes["ws"], "Wallet Screening", "enter source wallet address", vendor="KYT · Hex Trust (Chainalysis)")
draw_diamond(nodes["kyt"], "KYT screening", "pass / EDD / fail")
draw_card(nodes["blocked"], "Blocked / EDD", "compliance review or hold", fill=DANGER, border=DANGER_BORDER, ink=DANGER_INK, sub_ink="#f3b0b0")
draw_card(nodes["addr"], "Deposit Address", "one-time receiving address", vendor="Custody · Hex Trust")
draw_card(nodes["verify"], "Verification deposit", "Step 1 · send 1 unit first")
draw_diamond(nodes["vermon"], "Confirmed", "on-chain?")
draw_card(nodes["amt"], "Enter full amount", "Step 2 · main deposit")
draw_diamond(nodes["trdec"], "Travel Rule", "required?")
draw_card(nodes["tr"], "Travel Rule", "originator / beneficiary", vendor="TR vendor · Notabene / Hex Trust")
draw_card(nodes["send"], "Send full amount", None)
draw_diamond(nodes["mainmon"], "Confirmed", "on-chain?")
draw_card(nodes["success"], "Deposit Success", "funds received · clearing", fill=DONE, border=DONE_BORDER, ink=DONE_INK, sub_ink="#9fe7c2")
draw_card(nodes["settle"], "Settlement", "custodian clears · HKD credited", fill=DONE, border=DONE_BORDER, ink=DONE_INK, sub_ink="#9fe7c2", accent=DONE_BORDER)

# ---------------- KYT detail callout (left of the KYT diamond) ----------------
kx, ky, kw, kh = 300, 1768, 226, 176
add(f'<rect x="{kx}" y="{ky}" width="{kw}" height="{kh}" rx="12" fill="{VEN}" stroke="{VEN_BORDER}" stroke-width="1.3" stroke-dasharray="4 4"/>')
add(f'<text x="{kx+16}" y="{ky+27}" font-family="{FONT}" font-size="14" font-weight="800" fill="{VEN_INK}">KYT — what it checks</text>')
kyt_lines = [
    "Sanctions / watchlist hits",
    "Mixer &amp; tainted exposure",
    "Hop-distance analysis",
    "Risk score &#8594; pass/EDD/fail",
]
for i, t in enumerate(kyt_lines):
    yy = ky+54+i*23
    add(f'<circle cx="{kx+20}" cy="{yy-4:.0f}" r="2.6" fill="{VEN_BORDER}"/>')
    add(f'<text x="{kx+32}" y="{yy}" font-family="{FONT}" font-size="12.7" fill="{INK}">{t}</text>')
add(f'<text x="{kx+16}" y="{ky+kh-12}" font-family="{FONT}" font-size="11.5" fill="{MUTED}">on-chain KYT · pre-deposit screening</text>')
# dotted tie-line to the diamond
add(f'<path d="M {kx+kw} {C("kyt")["midy"]:.0f} L {C("kyt")["left"]:.0f} {C("kyt")["midy"]:.0f}" fill="none" stroke="{VEN_BORDER}" stroke-width="1.3" stroke-dasharray="3 4"/>')

# ---------------- legend + footer ----------------
ly = H-118
add(f'<rect x="40" y="{ly:.0f}" width="{W-80:.0f}" height="60" rx="12" fill="#101015" stroke="{PANEL_BORDER}"/>')
def legend_item(x, swatch_fill, swatch_border, label, shape="rect"):
    cy = ly+30
    if shape == "rect":
        add(f'<rect x="{x:.0f}" y="{cy-12:.0f}" width="26" height="22" rx="6" fill="{swatch_fill}" stroke="{swatch_border}" stroke-width="1.5"/>')
    elif shape == "vendor":
        add(f'<rect x="{x:.0f}" y="{cy-12:.0f}" width="26" height="22" rx="6" fill="{VEN}" stroke="{PANEL_BORDER}" stroke-width="1.5"/>')
        add(f'<rect x="{x:.0f}" y="{cy-12:.0f}" width="5" height="22" rx="2.5" fill="{VEN_BORDER}"/>')
    elif shape == "dia":
        add(f'<polygon points="{x+13:.0f},{cy-13:.0f} {x+26:.0f},{cy:.0f} {x+13:.0f},{cy+13:.0f} {x:.0f},{cy:.0f}" fill="{DEC}" stroke="{DEC_BORDER}" stroke-width="1.5"/>')
    add(f'<text x="{x+36:.0f}" y="{cy+5:.0f}" font-family="{FONT}" font-size="14" fill="{INK}">{esc(label)}</text>')
legend_item(56,   PANEL, PANEL_BORDER, "Screen / action", "rect")
legend_item(238,  API, API_BORDER, "Backend API call", "rect")
legend_item(430,  None, None, "Third-party vendor", "vendor")
legend_item(648,  DEC, DEC_BORDER, "Decision", "dia")
legend_item(792,  DANGER, DANGER_BORDER, "Compliance hold", "rect")
legend_item(1010, DONE, DONE_BORDER, "Successful settlement", "rect")
add(f'<text x="{W-60:.0f}" y="{ly+34:.0f}" font-family="{FONT}" font-size="12.5" fill="{MUTED}" text-anchor="end">Mock-up build · external KYC / KYT / Travel-Rule / custody mocked</text>')

add('</svg>')

with open("app-flow.svg", "w") as f:
    f.write("\n".join(parts))
print(f"wrote app-flow.svg  ({W}x{H})")
