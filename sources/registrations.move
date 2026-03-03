module oathbound::registrations {
    use std::string::String;
    use oathbound::attestation::{AdminCap, create};

    /// Register a skill. Target = content hash of skill file.
    public fun register_skill(
        admin: &AdminCap,
        subject: vector<u8>,
        skill_hash: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        create(admin, subject, b"register_skill".to_string(),
               skill_hash, vector[], uri, ctx);
    }

    /// Register an audit. Target = content hash of audited skill. Evidence = hash of audit report.
    public fun register_audit(
        admin: &AdminCap,
        subject: vector<u8>,
        skill_hash: vector<u8>,
        report_hash: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        create(admin, subject, b"security_audit".to_string(),
               skill_hash, report_hash, uri, ctx);
    }

    /// Register an author.
    public fun register_author(
        admin: &AdminCap,
        subject: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        create(admin, subject, b"register_author".to_string(),
               vector[], vector[], uri, ctx);
    }

    /// Register persona verification. Evidence = hash of Persona API response.
    public fun register_persona(
        admin: &AdminCap,
        subject: vector<u8>,
        persona_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        create(admin, subject, b"persona_verified".to_string(),
               vector[], persona_hash, b"".to_string(), ctx);
    }

    /// Link a skill to its author. Target = author's subject hash.
    public fun register_authorship(
        admin: &AdminCap,
        subject: vector<u8>,
        author_subject: vector<u8>,
        ctx: &mut TxContext,
    ) {
        create(admin, subject, b"authored_by".to_string(),
               author_subject, vector[], b"".to_string(), ctx);
    }
}
