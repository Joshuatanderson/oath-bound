module oathbound::attestation {
    use std::string::String;

    // === Error codes ===
    const EInvalidHashLength: u64 = 0;
    const HASH_LENGTH: u64 = 32;

    // === Structs ===

    /// Capability granting permission to create attestations.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Universal attestation record. Frozen on creation.
    /// Every operation in the system is an instance of this struct.
    public struct Attestation has key {
        id: UID,
        subject: vector<u8>,    // 32-byte SHA-256, e.g. sha256("skill:josh/code-review")
        claim: String,           // "register_skill", "security_audit", "register_author", etc.
        target: vector<u8>,      // 32 bytes or empty. What this claim references.
        evidence: vector<u8>,    // 32 bytes or empty. Proof backing the claim.
        uri: String,             // "ipfs://..." or empty. Retrieval hint.
    }

    // === Events ===

    public struct AttestationCreated has copy, drop {
        attestation_id: ID,
        subject: vector<u8>,
        claim: String,
        target: vector<u8>,
        evidence: vector<u8>,
        uri: String,
    }

    // === Init ===

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            ctx.sender(),
        );
    }

    // === Internal ===

    fun assert_valid_hash(hash: &vector<u8>) {
        assert!(hash.length() == HASH_LENGTH, EInvalidHashLength);
    }

    // === Core create ===

    public fun create(
        _admin: &AdminCap,
        subject: vector<u8>,
        claim: String,
        target: vector<u8>,
        evidence: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        assert_valid_hash(&subject);
        if (!target.is_empty()) { assert_valid_hash(&target); };
        if (!evidence.is_empty()) { assert_valid_hash(&evidence); };

        let id = object::new(ctx);

        sui::event::emit(AttestationCreated {
            attestation_id: id.to_inner(),
            subject,
            claim,
            target,
            evidence,
            uri,
        });

        transfer::freeze_object(Attestation {
            id, subject, claim, target, evidence, uri,
        });
    }

    // === Accessors ===

    public fun subject(self: &Attestation): vector<u8> { self.subject }
    public fun claim(self: &Attestation): String { self.claim }
    public fun target(self: &Attestation): vector<u8> { self.target }
    public fun evidence(self: &Attestation): vector<u8> { self.evidence }
    public fun uri(self: &Attestation): String { self.uri }

    // === Test helpers ===

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
