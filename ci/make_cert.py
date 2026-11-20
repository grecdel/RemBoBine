#!/usr/bin/env python3
"""Fabrique le certificat de signature Android à partir de la clé (toujours le même certificat
pour la même clé : dates et numéro fixes), pour que les mises à jour s'installent par-dessus."""
import datetime, sys
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization

key = serialization.load_pem_private_key(open(sys.argv[1], "rb").read(), password=None)
name = x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Rembobine"), x509.NameAttribute(NameOID.COMMON_NAME, "Rembobine")])
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc))
        .not_valid_after(datetime.datetime(2076, 1, 1, tzinfo=datetime.timezone.utc))
        .sign(key, hashes.SHA256()))
open(sys.argv[2], "wb").write(cert.public_bytes(serialization.Encoding.DER))
print("certificat prêt")
