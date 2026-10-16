"""Comandos de administração.

    python -m app.cli init                      # gera .env com chaves aleatórias e cria o banco
    python -m app.cli migrate                   # aplica migrações pendentes
    python -m app.cli create-user --role admin  # cria usuário (senha pedida no terminal)
"""

from __future__ import annotations

import argparse
import getpass
import secrets
import sys

from app.core.config import API_DIR

ENV_FILE = API_DIR / ".env"


def _generate_env() -> bool:
    if ENV_FILE.exists():
        print(f"• {ENV_FILE.name} já existe — mantido.")
        return False
    from cryptography.fernet import Fernet

    template = (API_DIR / ".env.example").read_text(encoding="utf-8")
    values = {
        "SECRET_KEY": secrets.token_urlsafe(48),
        "FIELD_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "CPF_HASH_KEY": secrets.token_urlsafe(48),
    }
    lines = []
    for line in template.splitlines():
        key = line.split("=", 1)[0]
        lines.append(f"{key}={values[key]}" if key in values and line.endswith("=") else line)
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    ENV_FILE.chmod(0o600)
    print(f"• {ENV_FILE.name} criado com chaves aleatórias. Guarde uma cópia segura das chaves:")
    print("  sem FIELD_ENCRYPTION_KEY os CPFs armazenados não podem ser lidos.")
    return True


def _migrate() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    command.upgrade(cfg, "head")
    print("• Banco de dados atualizado.")


def _read_password() -> str:
    from app.core.security import password_policy_errors

    if not sys.stdin.isatty():
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("Senha: ")
        if password != getpass.getpass("Confirme a senha: "):
            raise SystemExit("As senhas não conferem.")
    errors = password_policy_errors(password)
    if errors:
        raise SystemExit(" ".join(errors))
    return password


def _create_user(name: str, email: str, role: str) -> None:
    from sqlalchemy import select

    from app.core.security import hash_password, utcnow
    from app.db.session import get_sessionmaker
    from app.models import User, UserRole
    from app.services.audit import AuditAction, record_audit

    email = email.strip().lower()
    password = _read_password()
    with get_sessionmaker()() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise SystemExit(f"Já existe usuário com o e-mail {email}.")
        user = User(
            name=name.strip(),
            email=email,
            role=UserRole(role),
            password_hash=hash_password(password),
            password_changed_at=utcnow(),
            is_active=True,
            failed_login_attempts=0,
        )
        db.add(user)
        db.flush()
        record_audit(
            db,
            action=AuditAction.USER_CREATED,
            actor_email="cli",
            entity_type="user",
            entity_id=user.id,
            details={"email": email, "role": role, "via": "cli"},
        )
    print(f"• Usuário {email} ({role}) criado.")


def _seed_demo(count: int) -> None:
    from app.db.session import get_sessionmaker
    from app.importing.demo import demo_cohorts
    from app.importing.service import create_batch, process_batch
    from app.models import ImportSource

    with get_sessionmaker()() as db:
        for file_name, content in demo_cohorts(count):
            batch = create_batch(db, file_name=file_name, content=content, source=ImportSource.DEMO)
            batch = process_batch(db, batch.id) or batch
            print(f"• {file_name}: {batch.status.value} ({batch.rows_created} novas, "
                  f"{batch.rows_unchanged} sem alteração)")


def _demo_spreadsheet(path: str) -> None:
    from datetime import date, timedelta

    from app.importing.demo import build_cohort_workbook

    content = build_cohort_workbook(
        "DEMO T99", date.today() + timedelta(days=20), first_id=900000, size=60, seed=99
    )
    with open(path, "wb") as fh:
        fh.write(content)
    print(f"• Planilha fictícia gravada em {path}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Gera o .env (se não existir) e aplica as migrações")
    sub.add_parser("migrate", help="Aplica as migrações pendentes")
    create = sub.add_parser("create-user", help="Cria um usuário")
    create.add_argument("--name", required=True)
    create.add_argument("--email", required=True)
    create.add_argument("--role", choices=["admin", "operational", "viewer"], default="viewer")
    seed = sub.add_parser("seed-demo", help="Importa turmas FICTÍCIAS de demonstração")
    seed.add_argument("--cohorts", type=int, default=8)
    sheet = sub.add_parser("demo-spreadsheet", help="Gera uma planilha FICTÍCIA no modelo da turma")
    sheet.add_argument("path")

    args = parser.parse_args(argv)
    if args.command == "init":
        created = _generate_env()
        if created:
            # O .env acabou de ser criado: recarrega as configurações já em cache.
            from app.core.config import get_settings

            get_settings.cache_clear()
        _migrate()
        print(
            "\nPróximo passo: python -m app.cli create-user --role admin "
            "--name 'Seu Nome' --email voce@empresa.com"
        )
    elif args.command == "migrate":
        _migrate()
    elif args.command == "create-user":
        _create_user(args.name, args.email, args.role)
    elif args.command == "seed-demo":
        _seed_demo(args.cohorts)
    elif args.command == "demo-spreadsheet":
        _demo_spreadsheet(args.path)


if __name__ == "__main__":
    main()
