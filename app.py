"""
app.py — Flask application factory and entry point
Retail Inventory & Sales Management System
"""
import logging
from flask import Flask, render_template, jsonify, request
from config import Config
import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialise the DB connection pool at startup (not destructive — never drops anything)
    try:
        db.init_pool()
    except Exception as exc:
        logging.getLogger(__name__).error(
            "DB pool init failed at startup: %s — app will still start but API calls will fail until DB is reachable.", exc
        )

    # Register route blueprints
    from routes.dashboard      import bp as dashboard_bp
    from routes.categories     import bp as categories_bp
    from routes.brands         import bp as brands_bp
    from routes.products       import bp as products_bp
    from routes.suppliers      import bp as suppliers_bp
    from routes.customers      import bp as customers_bp
    from routes.purchases      import bp as purchases_bp
    from routes.sales          import bp as sales_bp
    from routes.invoices       import bp as invoices_bp
    from routes.payments       import bp as payments_bp
    from routes.returns        import bp as returns_bp
    from routes.stock_movements import bp as stock_movements_bp
    from routes.reports        import bp as reports_bp
    from routes.settings       import bp as settings_bp

    for blueprint in [
        dashboard_bp, categories_bp, brands_bp, products_bp,
        suppliers_bp, customers_bp, purchases_bp, sales_bp,
        invoices_bp, payments_bp, returns_bp, stock_movements_bp,
        reports_bp, settings_bp
    ]:
        app.register_blueprint(blueprint)

    # SPA catch-all — every non-API GET renders the shell
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def index(path):
        # API 404 (shouldn't normally hit this, but just in case)
        if path.startswith("api/") or path.startswith("static/"):
            return jsonify({"error": "Not found"}), 404
        return render_template("base.html")

    # JSON error handlers
    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found"}), 404
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def server_error(e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Internal server error"}), 500
        return render_template("errors/500.html"), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
