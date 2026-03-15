from flask import Flask, render_template, request, jsonify, send_from_directory, redirect
import os
import datetime

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'aiezzy-travel-2026')

# ===== Security Headers =====
@app.after_request
def add_security_headers(response):
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://www.google-analytics.com; "
        "frame-ancestors 'self'"
    )
    response.headers['Content-Security-Policy'] = csp
    return response


# ===== Homepage - Travel Planner Announcement =====
@app.route('/')
def home():
    return render_template('index.html')


# ===== Waitlist signup endpoint =====
@app.route('/api/waitlist', methods=['POST'])
def waitlist_signup():
    data = request.get_json()
    email = data.get('email', '').strip()
    if not email or '@' not in email:
        return jsonify({'error': 'Invalid email'}), 400

    # Store in a simple file (upgrade to DB later)
    waitlist_file = os.path.join(os.environ.get('DATA_DIR', '.'), 'waitlist.txt')
    os.makedirs(os.path.dirname(waitlist_file) if os.path.dirname(waitlist_file) else '.', exist_ok=True)
    with open(waitlist_file, 'a') as f:
        f.write(f"{email},{datetime.datetime.now().isoformat()}\n")

    return jsonify({'success': True, 'message': 'You\'re on the list!'})


# ===== Static files =====
@app.route('/robots.txt')
def robots():
    return send_from_directory('static', 'robots.txt', mimetype='text/plain')

@app.route('/sitemap.xml')
def sitemap():
    return send_from_directory('static', 'sitemap.xml', mimetype='application/xml')

@app.route('/favicon.png')
def favicon():
    return send_from_directory('static', 'favicon.png')

@app.route('/logo.png')
def logo():
    return send_from_directory('static', 'logo.png')


# ===== SEO Tool Landing Pages =====
# These pages drive 200-400 daily visitors - preserve them during pivot

SEO_PAGES = [
    'ai-image-generator', 'text-to-video', 'pdf-converter',
    'word-to-pdf', 'pdf-to-word', 'excel-to-pdf', 'pdf-to-excel',
    'jpg-to-pdf', 'pdf-to-jpg', 'png-to-pdf', 'pdf-to-png',
    'ppt-to-pdf', 'pdf-to-ppt', 'docx-to-pdf', 'pdf-to-text',
    'compress-pdf', 'merge-pdf', 'split-pdf', 'rotate-pdf',
    'pdf-to-csv', 'csv-to-pdf', 'html-to-pdf', 'pdf-to-html',
    'resize-image', 'compress-image', 'jpeg-to-png', 'png-to-jpeg',
    'webp-to-png', 'webp-to-jpeg', 'heic-to-jpeg', 'gif-to-png',
    'qr-code-generator', 'word-counter', 'video-to-gif', 'mp4-to-mp3',
    'case-converter', 'barcode-generator', 'audio-converter',
    'compress-video', 'compress-audio', 'text-formatter',
    'lorem-ipsum-generator', 'password-generator',
    'trim-audio', 'trim-video', 'change-video-speed',
    'chatgpt-alternative',
]

def create_seo_route(page_slug):
    """Create a route handler for an SEO landing page"""
    def handler():
        template_name = f'landing/{page_slug}.html'
        try:
            return render_template(template_name)
        except Exception:
            return redirect('/')
    handler.__name__ = f'seo_{page_slug.replace("-", "_")}'
    return handler

for slug in SEO_PAGES:
    app.route(f'/{slug}')(create_seo_route(slug))


# ===== About / Info pages =====
@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/tools')
def tools_page():
    return render_template('tools.html')


# ===== Error handlers =====
@app.errorhandler(404)
def not_found(e):
    return render_template('404.html'), 404


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)
