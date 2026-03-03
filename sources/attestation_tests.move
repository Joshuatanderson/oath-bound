#[test_only]
module oathbound::attestation_tests {
    use oathbound::attestation::{AdminCap, init_for_testing};
    use oathbound::registrations::{
        register_skill, register_audit, register_author,
        register_persona, register_authorship,
    };

    fun dummy_hash(): vector<u8> {
        vector[
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
        ]
    }

    #[test]
    fun test_init_creates_admin_cap() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_register_skill() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_skill(
                &cap,
                dummy_hash(),
                dummy_hash(),
                b"ipfs://QmTest123".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_register_audit() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_audit(
                &cap,
                dummy_hash(),
                dummy_hash(),
                dummy_hash(),
                b"ipfs://QmAuditReport".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_register_author() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_author(
                &cap,
                dummy_hash(),
                b"ipfs://QmAuthorProfile".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_register_persona() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_persona(
                &cap,
                dummy_hash(),
                dummy_hash(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    fun test_register_authorship() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_authorship(
                &cap,
                dummy_hash(),
                dummy_hash(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = oathbound::attestation::EInvalidHashLength)]
    fun test_invalid_subject_length() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_skill(
                &cap,
                vector[0, 1, 2],
                dummy_hash(),
                b"".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = oathbound::attestation::EInvalidHashLength)]
    fun test_invalid_target_length() {
        let mut scenario = sui::test_scenario::begin(@0xABCD);
        { init_for_testing(scenario.ctx()); };
        scenario.next_tx(@0xABCD);
        {
            let cap = scenario.take_from_sender<AdminCap>();
            register_skill(
                &cap,
                dummy_hash(),
                vector[0, 1, 2],
                b"".to_string(),
                scenario.ctx(),
            );
            scenario.return_to_sender(cap);
        };
        scenario.end();
    }
}
