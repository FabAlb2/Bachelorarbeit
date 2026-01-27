package com.whs.bachelorarbeit.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor

@Entity
@Table(
        name = "facilities",
        uniqueConstraints = @UniqueConstraint(columnNames = {"source", "source_key"})
)


public class Facility {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String source; // "kvwl"

    @Column(name = "source_key", nullable = false)
    private String sourceKey; // hash aus Adresse

    @Column(name = "facility_name", nullable = false)
    private String facilityName;

    @Column(nullable = false)
    private String type; // z.B. ARZTPRAXIS

    private String street;

    @Column(name = "postal_code")
    private String postalCode;

    private String city;
    private String phone;
    private Double latitude;
    private Double longitude;

    @Column(name = "wheelchair_accessible")
    private Boolean wheelchairAccessible;
}
