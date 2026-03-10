import os
import sys
import time
import psycopg

from sources.opendata_bevoelkerung_nationalitaet import persist_population_from_csv
from sources.indikatorenkatalog_arbeitslosenquote import persist_unemployment_from_csv


DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "bachelor")
DB_USER = os.getenv("DB_USER", "bachelor")
DB_PASSWORD = os.getenv("DB_PASSWORD", "bachelor")

DATA_DIR = os.getenv("DATA_DIR", "/app/data")

POPULATION_CSV_PATH = os.getenv(
    "POPULATION_CSV_PATH",
    f"{DATA_DIR}/stadt-gelsenkirchen-statistik-bevoelkerung-nationalitaet.csv"
)

UNEMPLOYMENT_CSV_PATH = os.getenv(
    "UNEMPLOYMENT_CSV_PATH",
    f"{DATA_DIR}/Stand_August25_Indikatorenkatalog.csv"
)


def wait_for_db(max_tries: int = 30, sleep_s: float = 1.0) -> None:
    for i in range(max_tries):
        try:
            with psycopg.connect(
                host=DB_HOST,
                port=DB_PORT,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
            ) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
            print("[file-importer] DB is ready.")
            return
        except Exception as e:
            print(f"[file-importer] waiting for DB ({i+1}/{max_tries})... {e}")
            time.sleep(sleep_s)

    raise RuntimeError("DB did not become ready in time.")


def import_population(conn):
    print("[file-importer] 📄 Starte Import: population")
    written = persist_population_from_csv(conn, POPULATION_CSV_PATH)
    print(f"[file-importer] ✅ population fertig: {written}")
    return written


def import_unemployment(conn):
    print("[file-importer] 📄 Starte Import: unemployment")
    written = persist_unemployment_from_csv(conn, UNEMPLOYMENT_CSV_PATH)
    print(f"[file-importer] ✅ unemployment fertig: {written}")
    return written


IMPORT_JOBS = {
    "population": import_population,
    "unemployment": import_unemployment,
}


def run_job(conn, job_name: str) -> None:
    job = IMPORT_JOBS.get(job_name)
    if job is None:
        valid = ", ".join(sorted(IMPORT_JOBS.keys()))
        raise ValueError(f"Unbekannter Import-Job '{job_name}'. Erlaubt: {valid}")

    try:
        job(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def main():
    wait_for_db()

    target = sys.argv[1] if len(sys.argv) > 1 else "all"

    with psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    ) as conn:
        if target == "all":
            for job_name in IMPORT_JOBS:
                run_job(conn, job_name)
        else:
            run_job(conn, target)

    print("[file-importer] ✅ Alle gewünschten Dateiimporte abgeschlossen.")


if __name__ == "__main__":
    main()