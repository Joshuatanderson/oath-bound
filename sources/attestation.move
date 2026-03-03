module oathbound::attestation {
    use std::string::String;

    // === Error codes ===
    const EInvalidHashLength: u64 = 0;

    const HASH_LENGTH: u64 = 32;

    // === Structs ===

    /// Capability granting permission to create attestations.
    /// Transferred to the publisher on init.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared fields for all attestation types.
    public struct AttestationCore has store {
        subject: vector<u8>,  // 32-byte SHA-256
        claim: String,        // set internally per type, not caller-controlled
        uri: String,
    }

    /// A skill registration attestation.
    /// Lifecycle: create → freeze.
    public struct SkillAttestation has key {
        id: UID,
        core: AttestationCore,
        skill_hash: vector<u8>,  // SHA-256 of tarball
    }

    /// An audit of an existing skill.
    /// References the SkillAttestation being audited.
    public struct AuditAttestation has key {
        id: UID,
        core: AttestationCore,
        skill_id: ID,            // references the audited SkillAttestation
        skill_hash: vector<u8>,  // SHA-256 of audited tarball
    }

    /// An author identity attestation.
    public struct AuthorAttestation has key {
        id: UID,
        core: AttestationCore,
    }

    /// A persona identity attestation.
    /// References the AuthorAttestation this persona belongs to.
    public struct PersonaAttestation has key {
        id: UID,
        core: AttestationCore,
        author_id: ID,             // references the AuthorAttestation
        persona_hash: vector<u8>,  // SHA-256 of identity proof
    }

    // === Events ===

    public struct SkillAttestationCreated has copy, drop {
        attestation_id: ID,
        subject: vector<u8>,
        claim: String,
        skill_hash: vector<u8>,
        uri: String,
    }

    public struct AuditAttestationCreated has copy, drop {
        attestation_id: ID,
        skill_id: ID,
        subject: vector<u8>,
        claim: String,
        skill_hash: vector<u8>,
        uri: String,
    }

    public struct AuthorAttestationCreated has copy, drop {
        attestation_id: ID,
        subject: vector<u8>,
        claim: String,
        uri: String,
    }

    public struct PersonaAttestationCreated has copy, drop {
        attestation_id: ID,
        author_id: ID,
        subject: vector<u8>,
        claim: String,
        persona_hash: vector<u8>,
        uri: String,
    }

    // === Init ===

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            ctx.sender(),
        );
    }

    // === Internal helpers ===

    fun new_core(
        subject: vector<u8>,
        claim: String,
        uri: String,
    ): AttestationCore {
        assert!(subject.length() == HASH_LENGTH, EInvalidHashLength);
        AttestationCore { subject, claim, uri }
    }

    fun assert_valid_hash(hash: &vector<u8>) {
        assert!(hash.length() == HASH_LENGTH, EInvalidHashLength);
    }

    // === Create functions ===

    public fun create_skill(
        _admin: &AdminCap,
        subject: vector<u8>,
        skill_hash: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        assert_valid_hash(&skill_hash);
        let core = new_core(subject, b"register_skill".to_string(), uri);
        let id = object::new(ctx);
        let attestation_id = id.to_inner();

        sui::event::emit(SkillAttestationCreated {
            attestation_id,
            subject: core.subject,
            claim: core.claim,
            skill_hash,
            uri: core.uri,
        });

        transfer::freeze_object(SkillAttestation { id, core, skill_hash });
    }

    public fun create_audit(
        _admin: &AdminCap,
        skill: &SkillAttestation,
        subject: vector<u8>,
        skill_hash: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        assert_valid_hash(&skill_hash);
        let core = new_core(subject, b"register_audit".to_string(), uri);
        let id = object::new(ctx);
        let attestation_id = id.to_inner();
        let skill_id = object::id(skill);

        sui::event::emit(AuditAttestationCreated {
            attestation_id,
            skill_id,
            subject: core.subject,
            claim: core.claim,
            skill_hash,
            uri: core.uri,
        });

        transfer::freeze_object(AuditAttestation { id, core, skill_id, skill_hash });
    }

    public fun create_author(
        _admin: &AdminCap,
        subject: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        let core = new_core(subject, b"register_author".to_string(), uri);
        let id = object::new(ctx);
        let attestation_id = id.to_inner();

        sui::event::emit(AuthorAttestationCreated {
            attestation_id,
            subject: core.subject,
            claim: core.claim,
            uri: core.uri,
        });

        transfer::freeze_object(AuthorAttestation { id, core });
    }

    public fun create_persona(
        _admin: &AdminCap,
        author: &AuthorAttestation,
        subject: vector<u8>,
        persona_hash: vector<u8>,
        uri: String,
        ctx: &mut TxContext,
    ) {
        assert_valid_hash(&persona_hash);
        let core = new_core(subject, b"register_persona".to_string(), uri);
        let id = object::new(ctx);
        let attestation_id = id.to_inner();
        let author_id = object::id(author);

        sui::event::emit(PersonaAttestationCreated {
            attestation_id,
            author_id,
            subject: core.subject,
            claim: core.claim,
            persona_hash,
            uri: core.uri,
        });

        transfer::freeze_object(PersonaAttestation { id, core, author_id, persona_hash });
    }

    // === Accessors: AttestationCore ===

    public fun subject(core: &AttestationCore): vector<u8> { core.subject }
    public fun claim(core: &AttestationCore): String { core.claim }
    public fun uri(core: &AttestationCore): String { core.uri }

    // === Accessors: SkillAttestation ===

    public fun skill_core(self: &SkillAttestation): &AttestationCore { &self.core }
    public fun skill_hash(self: &SkillAttestation): vector<u8> { self.skill_hash }

    // === Accessors: AuditAttestation ===

    public fun audit_core(self: &AuditAttestation): &AttestationCore { &self.core }
    public fun audit_skill_id(self: &AuditAttestation): ID { self.skill_id }
    public fun audit_skill_hash(self: &AuditAttestation): vector<u8> { self.skill_hash }

    // === Accessors: AuthorAttestation ===

    public fun author_core(self: &AuthorAttestation): &AttestationCore { &self.core }

    // === Accessors: PersonaAttestation ===

    public fun persona_core(self: &PersonaAttestation): &AttestationCore { &self.core }
    public fun persona_author_id(self: &PersonaAttestation): ID { self.author_id }
    public fun persona_hash(self: &PersonaAttestation): vector<u8> { self.persona_hash }

    // === Test helpers ===

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    // === Tests ===

    #[test_only]
    fun dummy_hash(): vector<u8> {
        vector[
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
        ]
    }

    #[test]
    fun test_init_creates_admin_cap() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_create_skill_success() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            create_skill(
                &cap,
                dummy_hash(),
                dummy_hash(),
                b"https://oathbound.ai/skills/test".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_create_audit_references_skill() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        // Create a skill first
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            create_skill(
                &cap,
                dummy_hash(),
                dummy_hash(),
                b"".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        // Create an audit referencing that skill
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            let skill = scenario.take_immutable<SkillAttestation>();
            create_audit(
                &cap,
                &skill,
                dummy_hash(),
                dummy_hash(),
                b"".to_string(),
                scenario.ctx(),
            );
            sui::test_scenario::return_immutable(skill);
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_create_author_success() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            create_author(
                &cap,
                dummy_hash(),
                b"https://oathbound.ai/authors/test".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_create_persona_references_author() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        // Create an author first
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            create_author(
                &cap,
                dummy_hash(),
                b"".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        // Create a persona referencing that author
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            let author = scenario.take_immutable<AuthorAttestation>();
            create_persona(
                &cap,
                &author,
                dummy_hash(),
                dummy_hash(),
                b"".to_string(),
                scenario.ctx(),
            );
            sui::test_scenario::return_immutable(author);
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = EInvalidHashLength)]
    fun test_invalid_subject_length() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            create_skill(
                &cap,
                vector[0, 1, 2], // too short
                dummy_hash(),
                b"".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = EInvalidHashLength)]
    fun test_invalid_skill_hash_length() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        {
            init_for_testing(scenario.ctx());
        };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            create_skill(
                &cap,
                dummy_hash(),
                vector[0, 1, 2], // too short
                b"".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }
}
