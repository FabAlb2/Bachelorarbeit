package com.whs.bachelorarbeit.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@Setter
@Entity
@Table (
        name = "district_unemployment",
        uniqueConstraints = @UniqueConstraint(columnNames = {"stichtag", "stadtteil_id"})
)



public class DistrictUnemployment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate stichtag;

    @Column(name = "stadtteil_id", nullable = false)
    private Integer stadtteilId;

    @Column(name = "stadtteil_name", nullable = false)
    private String stadtteilName;

    private BigDecimal arbeitslosenanteil;

    @Column(name = "arbeitslosenanteil_maennlich")
    private BigDecimal arbeitslosenanteilMaennlich;

    @Column(name = "arbeitslosenanteil_weiblich")
    private BigDecimal arbeitslosenanteilWeiblich;

    @Column(name = "arbeitslosenanteil_deutsch")
    private BigDecimal arbeitslosenanteilDeutsch;

    @Column(name = "arbeitslosenanteil_nichtdeutsch")
    private BigDecimal arbeitslosenanteilNichtdeutsch;

    @Column(name = "jugendarbeitslosigkeit_u25")
    private BigDecimal jugendarbeitslosigkeitU25;


}
